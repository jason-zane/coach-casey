import { readFile } from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, SONNET_MODEL } from "./anthropic";
import { loadRecentActivities } from "@/lib/strava/ingest";

type PriorObservation = {
  observation: string;
  chip: string | null;
  response: string | null;
};

let cachedPrompt: string | null = null;
async function systemPrompt(): Promise<string> {
  if (!cachedPrompt) {
    const p = path.join(process.cwd(), "prompts/onboarding-validation.md");
    cachedPrompt = await readFile(p, "utf8");
  }
  return cachedPrompt;
}

function formatPace(secPerKm: number | null | undefined): string {
  if (!secPerKm) return "n/a";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function dayOfWeek(iso: string): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(iso).getDay()
  ];
}

type LapRow = {
  distance?: number;
  moving_time?: number;
  average_speed?: number;
  average_heartrate?: number;
};

/**
 * If an activity has laps with meaningful pace variation, append a one-line
 * lap summary so the LLM can recognise it as a workout (intervals, tempo,
 * progression) rather than reading it as a flat steady run.
 */
function lapSummary(laps: unknown): string {
  if (!Array.isArray(laps) || laps.length < 2) return "";
  const rows = laps as LapRow[];
  const paced = rows
    .map((l) => {
      if (!l.distance || !l.moving_time || l.distance < 200) return null;
      return Math.round(l.moving_time / (l.distance / 1000));
    })
    .filter((p): p is number => p !== null);
  if (paced.length < 2) return "";
  const min = Math.min(...paced);
  const max = Math.max(...paced);
  // ~30s/km spread or bigger = worth surfacing
  if (max - min < 30) return "";

  const lapDetails = rows
    .slice(0, 10)
    .map((l, i) => {
      const km = l.distance ? (l.distance / 1000).toFixed(2) : "?";
      const p =
        l.distance && l.moving_time
          ? formatPace(Math.round(l.moving_time / (l.distance / 1000)))
          : "?";
      const hr = l.average_heartrate ? ` HR ${Math.round(l.average_heartrate)}` : "";
      return `L${i + 1} ${km}km ${p}${hr}`;
    })
    .join(" · ");
  return `\n      laps: ${lapDetails}`;
}

function summariseActivities(
  activities: Awaited<ReturnType<typeof loadRecentActivities>>,
): string {
  if (activities.length === 0) return "No activities in the last 12 weeks.";

  // Weekly aggregates + listing of individual runs
  const byWeek = new Map<
    string,
    { count: number; km: number; byKind: Record<string, number> }
  >();

  for (const a of activities) {
    const d = new Date(a.start_date_local);
    // Anchor each run to its ISO-week Monday
    const monday = new Date(d);
    const day = (d.getDay() + 6) % 7; // 0=Mon
    monday.setDate(d.getDate() - day);
    const key = monday.toISOString().slice(0, 10);
    const agg = byWeek.get(key) ?? { count: 0, km: 0, byKind: {} };
    agg.count += 1;
    agg.km += (a.distance_m ?? 0) / 1000;
    byWeek.set(key, agg);
  }

  const weeklyLines = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([wk, v]) =>
        `  - Week of ${wk}: ${v.count} run${v.count === 1 ? "" : "s"}, ${v.km.toFixed(1)} km`,
    )
    .join("\n");

  const recentLines = activities
    .slice(-20)
    .map((a) => {
      const date = a.start_date_local.slice(0, 10);
      const dow = dayOfWeek(a.start_date_local);
      const km = ((a.distance_m ?? 0) / 1000).toFixed(1);
      const pace = formatPace(a.avg_pace_s_per_km);
      const hr = a.avg_hr ? ` HR ${a.avg_hr}` : "";
      const lapLine = lapSummary(a.laps);
      return `  - ${date} (${dow}): ${a.name ?? "Run"}, ${km} km, ${pace}${hr}${lapLine}`;
    })
    .join("\n");

  return `Weekly volumes (last 10 weeks):
${weeklyLines}

Most recent runs:
${recentLines}`;
}

const MOCK_OBSERVATIONS = [
  "You've been averaging about 55km a week over the last couple of months, with most weeks looking like five runs. Sundays read like your long day, Wednesdays look like the harder session. That match what you're running?",
  "Your easy days sit around 5:20/km, and the Wednesday workouts drop into the 4:10 to 4:20 range on average. HR stays down on the easy runs. Does that line up with what you're aiming for?",
  "Long runs have been creeping up, 22, 24, 28, then 32km a couple of weeks back. That read like the build you'd planned, or has it stretched further than intended?",
  "Looks like there's a week in the middle where the mileage drops right off, just a couple of short runs. Sick, travelling, or something else going on?",
  "One Saturday a few weeks back, what reads as an easy day came out closer to 4:58/km, a good chunk quicker than your usual easy. Group run, or feeling fresh?",
];

function mockMode(): boolean {
  if (process.env.LLM_MODE === "mock") return true;
  if (process.env.LLM_MODE === "real") return false;
  return !process.env.ANTHROPIC_API_KEY;
}

/**
 * Retry Anthropic on transient overload (529) and rate-limit (429) errors.
 * Auth errors, malformed requests, and billing errors are NOT retryable and
 * surface immediately.
 */
async function callWithRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 700 }: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status =
        typeof e === "object" && e && "status" in e
          ? (e as { status: unknown }).status
          : null;
      const retryable = status === 529 || status === 429;
      if (!retryable || i === attempts - 1) throw e;
      const delay = baseDelayMs * Math.pow(2, i); // 700, 1400, 2800
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export async function generateNextObservation(
  athleteId: string,
  prior: PriorObservation[],
): Promise<{ text: string; done: boolean }> {
  if (mockMode()) {
    const idx = prior.length;
    if (idx >= MOCK_OBSERVATIONS.length) return { text: "", done: true };
    return { text: MOCK_OBSERVATIONS[idx], done: false };
  }

  const activities = await loadRecentActivities(athleteId, 12);
  const summary = summariseActivities(activities);
  const system = await systemPrompt();

  const priorBlock =
    prior.length === 0
      ? "You have not made any observations yet."
      : prior
          .map(
            (p, i) =>
              `Observation ${i + 1}: ${p.observation}\n` +
              `Athlete response: ${p.chip ?? "(no chip)"}${p.response ? `, "${p.response}"` : ""}`,
          )
          .join("\n\n");

  const userMessage = `# Athlete activity summary

${summary}

# Observations so far

${priorBlock}

# Task

Produce the next observation, or respond with DONE if you have already made
5 good observations, if the athlete has signalled they want to move on, or if
there is not enough material to say something specific.`;

  const response = await callWithRetry(() =>
    anthropic().messages.create({
      model: SONNET_MODEL,
      max_tokens: 400,
      system: [
        {
          type: "text",
          text: system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    }),
  );

  const text =
    response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim() || "";

  const done = text.trim().toUpperCase() === "DONE";
  return { text, done };
}
