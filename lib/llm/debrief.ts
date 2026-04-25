import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, SONNET_MODEL } from "./anthropic";
import type {
  DebriefActivity,
  DebriefArcRun,
  DebriefContext,
  DebriefWeekAggregate,
} from "@/lib/thread/debrief-context";
import {
  pickerEnabled,
  pickFollowUp,
  type FollowUpPick,
} from "./followup-picker";
import { generateRpeBranchedFollowUp } from "./followup-rpe-branched";

export type DebriefSkipReason =
  | "non_run"
  | "too_short"
  | "aborted"
  | "duplicate_activity";

export type DebriefOutcome =
  | { kind: "debrief"; body: string; followUp: string | null }
  | { kind: "skip"; reason: DebriefSkipReason };

const ABORTED_NAME_TOKENS = ["abort", "dnf", "stopped", "cut short"];

/**
 * Gate an activity before the LLM sees it. Handles §2.3 edge cases:
 * non-run activities, aborted activities, and pathologically short runs.
 * Very short legitimate runs (recovery jogs, cooldowns) fall through — the
 * prompt is instructed to produce a compressed debrief for them.
 */
export function debriefGate(activity: DebriefActivity): DebriefSkipReason | null {
  const type = (activity.activityType ?? "").toLowerCase();
  if (type && !type.includes("run")) return "non_run";

  const nameLc = (activity.name ?? "").toLowerCase();
  if (ABORTED_NAME_TOKENS.some((t) => nameLc.includes(t))) {
    // Name-flagged aborts below 1 km are skipped. Flagged aborts above 1 km
    // still get a debrief (they are often false positives or meaningful
    // early pulls the prompt should read).
    if (activity.distanceKm < 1) return "aborted";
  }

  if (activity.distanceKm < 1 || activity.movingTimeS < 300) return "too_short";
  return null;
}

function formatPace(secPerKm: number | null | undefined): string {
  if (!secPerKm) return "n/a";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function goalTimeLabel(seconds: number | null): string | null {
  if (seconds == null) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function renderActivity(a: DebriefActivity): string {
  const lines: string[] = [];
  const date = a.date.slice(0, 10);
  lines.push(
    `- Date: ${date} (${a.dayOfWeek}), started ${new Date(a.date).toISOString().slice(11, 16)} local`,
  );
  lines.push(`- Name: ${a.name ?? "(unnamed)"}`);
  lines.push(`- Type: ${a.activityType ?? "unknown"}`);
  lines.push(`- Distance: ${a.distanceKm.toFixed(2)} km`);
  lines.push(`- Moving time: ${formatDuration(a.movingTimeS)}`);
  lines.push(`- Average pace: ${formatPace(a.paceSPerKm)}`);
  lines.push(a.avgHr ? `- Average HR: ${a.avgHr} bpm` : "- Average HR: not recorded");
  lines.push(a.maxHr ? `- Max HR: ${a.maxHr} bpm` : "- Max HR: not recorded");
  lines.push(
    a.elevGainM != null ? `- Elevation gain: ${Math.round(a.elevGainM)} m` : "- Elevation gain: not recorded",
  );

  if (a.laps.length > 0) {
    lines.push("- Laps:");
    for (const l of a.laps) {
      const hr = l.hr ? ` HR ${l.hr}` : "";
      lines.push(`    L${l.idx}: ${l.km.toFixed(2)} km, ${formatPace(l.paceSPerKm)}${hr}`);
    }
    lines.push(
      `- Lap shape: ${a.hasWorkoutShape ? "workout (≥30s/km spread across laps)" : "steady (minor spread)"}`,
    );
  } else {
    lines.push("- Laps: none recorded");
  }

  return lines.join("\n");
}

function renderArc(
  weeks: DebriefWeekAggregate[],
  runs: DebriefArcRun[],
): string {
  if (weeks.length === 0 && runs.length === 0) {
    return "(no prior activities in the arc window)";
  }

  const weekLines = weeks.map(
    (w) => `  - Week of ${w.weekStart}: ${w.runCount} runs, ${w.km.toFixed(1)} km`,
  );

  const runLines = runs.slice(-20).map((r) => {
    const date = r.date.slice(0, 10);
    const dow = new Date(r.date).toLocaleString("en-US", { weekday: "short" });
    const hr = r.avgHr ? ` HR ${r.avgHr}` : "";
    const workout = r.isWorkout ? " [workout shape]" : "";
    return `  - ${date} (${dow}): ${r.name ?? "Run"}, ${r.distanceKm.toFixed(1)} km, ${formatPace(r.paceSPerKm)}${hr}${workout}`;
  });

  return `Weekly volumes (runs in the arc window, excluding today):
${weekLines.join("\n")}

Most recent runs in the arc (up to last 20):
${runLines.join("\n")}`;
}

function renderStableContext(ctx: DebriefContext): string {
  const parts: string[] = [];
  parts.push(`# Athlete\n${ctx.displayName ?? "(unnamed)"}`);

  if (ctx.goalRaces.length > 0) {
    const lines = ctx.goalRaces
      .map((r) => {
        const name = r.name ?? "(unnamed race)";
        const date = r.raceDate ?? "date TBD";
        const goal = goalTimeLabel(r.goalTimeSeconds);
        return `- ${name} on ${date}${goal ? `, goal ${goal}` : ""}`;
      })
      .join("\n");
    parts.push(`# Goal races\n${lines}`);
  }

  if (ctx.activePlanText) {
    parts.push(`# Active training plan\n${ctx.activePlanText.trim()}`);
  }

  if (ctx.injuries.length > 0) {
    const lines = ctx.injuries
      .slice(0, 20)
      .map(
        (m) =>
          `- ${m.content}${m.tags.length ? ` (${m.tags.join(", ")})` : ""} [noted ${m.createdAt.slice(0, 10)}]`,
      )
      .join("\n");
    parts.push(`# Known injuries and niggles\n${lines}`);
  } else {
    parts.push("# Known injuries and niggles\nNone on file.");
  }

  if (ctx.priorDebriefs.length > 0) {
    const lines = ctx.priorDebriefs
      .slice(0, 3)
      .map((d) => {
        // Truncate each prior debrief to ~600 chars so the block doesn't balloon;
        // the purpose is to let Casey avoid repeating themes, not re-read the
        // full text.
        const body = d.body.length > 600 ? `${d.body.slice(0, 600)}…` : d.body;
        return `- [${d.createdAt.slice(0, 10)}]\n  ${body.replace(/\n/g, "\n  ")}`;
      })
      .join("\n\n");
    parts.push(`# Recent prior debriefs (so you don't repeat themes)\n${lines}`);
  } else {
    parts.push(
      "# Recent prior debriefs\nNone. This is the first debrief you are writing for this athlete.",
    );
  }

  return parts.join("\n\n");
}

function renderRpeHistory(ctx: DebriefContext): string {
  if (ctx.rpeHistory.length === 0) {
    return "(no RPE answers in the trailing 28 days — the athlete hasn't engaged with the prompt yet, or this is early in the trial.)";
  }
  const lines = ctx.rpeHistory.slice(-20).map((r) => {
    const date = r.date.slice(0, 10);
    const dow = new Date(r.date).toLocaleString("en-US", { weekday: "short" });
    const pace = formatPace(r.paceSPerKm);
    const tag = r.isWorkout ? " [workout]" : "";
    return `  - ${date} (${dow}): ${r.distanceKm.toFixed(1)} km, ${pace}${tag}, RPE ${r.rpeValue}`;
  });
  return `Trailing 28-day RPE log (oldest first, this run excluded):\n${lines.join("\n")}`;
}

function renderVolatileContext(ctx: DebriefContext): string {
  const parts: string[] = [];

  parts.push(`# The run being debriefed\n${renderActivity(ctx.activity)}`);

  parts.push(`# Recent training arc\n${renderArc(ctx.arcWeeks, ctx.arcRuns)}`);

  // Per spec §6 + §9.1: trailing RPE feeds the debrief as longitudinal
  // context; the current activity's RPE does not. Pattern recognition
  // for divergence ("yesterday's easy was a 7, keeping today gentler")
  // happens at this layer.
  parts.push(`# Trailing RPE history (longitudinal context)\n${renderRpeHistory(ctx)}`);

  if (ctx.lifeContext.length > 0) {
    const lines = ctx.lifeContext
      .slice(0, 15)
      .map(
        (m) =>
          `- [${m.createdAt.slice(0, 10)}] ${m.content}${m.tags.length ? ` (${m.tags.join(", ")})` : ""}`,
      )
      .join("\n");
    parts.push(`# Recent life context (last 14 days)\n${lines}`);
  } else {
    parts.push("# Recent life context\nNothing logged in the last 14 days.");
  }

  return parts.join("\n\n");
}

let cachedDebriefPrompt: string | null = null;
let cachedConversationalPrompt: string | null = null;
let cachedStructuredPrompt: string | null = null;

async function loadDebriefPrompt(): Promise<string> {
  if (!cachedDebriefPrompt) {
    const p = path.join(process.cwd(), "prompts/post-run-debrief.md");
    cachedDebriefPrompt = await readFile(p, "utf8");
  }
  return cachedDebriefPrompt;
}

async function loadConversationalPrompt(): Promise<string> {
  if (!cachedConversationalPrompt) {
    const p = path.join(process.cwd(), "prompts/post-run-followup-conversational.md");
    cachedConversationalPrompt = await readFile(p, "utf8");
  }
  return cachedConversationalPrompt;
}

async function loadStructuredPrompt(): Promise<string> {
  if (!cachedStructuredPrompt) {
    const p = path.join(process.cwd(), "prompts/post-run-followup-structured.md");
    cachedStructuredPrompt = await readFile(p, "utf8");
  }
  return cachedStructuredPrompt;
}

function mockMode(): boolean {
  if (process.env.LLM_MODE === "mock") return true;
  if (process.env.LLM_MODE === "real") return false;
  return !process.env.ANTHROPIC_API_KEY;
}

function mockDebrief(ctx: DebriefContext): { body: string; followUp: string | null } {
  const a = ctx.activity;
  const first = ctx.isFirstDebrief
    ? "First one I've read for you, so take this as a starting point rather than a full reading."
    : null;

  const lead = a.hasWorkoutShape
    ? `Workout shape today: ${a.laps.length} laps, pace spread of ${(Math.max(...a.laps.map((l) => l.paceSPerKm ?? 0)) - Math.min(...a.laps.map((l) => l.paceSPerKm ?? 0)))}s/km.`
    : `Steady ${a.distanceKm.toFixed(1)} km on ${a.dayOfWeek}, ${formatPace(a.paceSPerKm)}.`;

  const injuryNote = ctx.injuries.length > 0
    ? `Keeping an eye on the ${ctx.injuries[0].tags.join(", ") || "niggle"} you mentioned.`
    : null;

  const arcNote = ctx.arcWeeks.length > 0
    ? `Last week totaled ${ctx.arcWeeks[ctx.arcWeeks.length - 1]?.km.toFixed(1)} km across ${ctx.arcWeeks[ctx.arcWeeks.length - 1]?.runCount} runs.`
    : "Not much arc to read from yet.";

  const body = [first, lead, injuryNote, arcNote].filter(Boolean).join("\n\n");

  const followUp = a.hasWorkoutShape
    ? "How did the last rep feel relative to the first two?"
    : ctx.injuries.length > 0
      ? "Calf still holding up alright after that one?"
      : null;

  return { body, followUp };
}

type CallWithRetryOpts = { attempts?: number; baseDelayMs?: number };

async function callWithRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 700 }: CallWithRetryOpts = {},
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
      const delay = baseDelayMs * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Generate a debrief body for the given context. Does not persist. Edge-case
 * gating happens in `debriefGate` before this is called. The follow-up is
 * generated in a separate call so the two prompts can be evaluated
 * independently (see v1-scope §4).
 */
export async function generateDebriefBody(ctx: DebriefContext): Promise<string> {
  if (mockMode()) return mockDebrief(ctx).body;

  const system = await loadDebriefPrompt();
  const stable = renderStableContext(ctx);
  const volatile = renderVolatileContext(ctx);

  const response = await callWithRetry(() =>
    anthropic().messages.create({
      model: SONNET_MODEL,
      max_tokens: 900,
      temperature: 1.0,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
        { type: "text", text: stable, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: `${volatile}\n\n# Task\n\nWrite the debrief for the run described above. Output the debrief body only, as plain prose, with no follow-up question attached.`,
        },
      ],
    }),
  );

  const text =
    response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim() || "";
  return text;
}

/**
 * Conversational follow-up — the long-running default. Generated per-run
 * based on what's notable about the activity. Returns `null` when the
 * prompt elects to `SKIP` rather than ask a generic question.
 */
export async function generateConversationalFollowUp(
  ctx: DebriefContext,
): Promise<string | null> {
  if (mockMode()) return mockDebrief(ctx).followUp;

  const system = await loadConversationalPrompt();
  const stable = renderStableContext(ctx);
  const volatile = renderVolatileContext(ctx);

  const response = await callWithRetry(() =>
    anthropic().messages.create({
      model: SONNET_MODEL,
      max_tokens: 160,
      temperature: 0.9,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
        { type: "text", text: stable, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: `${volatile}\n\n# Task\n\nProduce one follow-up question for the run described above, or respond with the literal string SKIP if no specific question is worth asking.`,
        },
      ],
    }),
  );

  const text =
    response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim() || "";
  if (!text || text.toUpperCase() === "SKIP") return null;
  return text;
}

/**
 * Structured follow-up — picks from the ranked question bank in
 * `post-run-followup-structured.md`. The bank is a starter draft (per
 * `v1-scope.md` §6); the prompt returns `DEFER` when nothing fits, and
 * the caller falls back to conversational.
 */
export async function generateStructuredFollowUp(
  ctx: DebriefContext,
): Promise<string | null> {
  if (mockMode()) {
    return "What's on the plan for this week, roughly?";
  }

  const system = await loadStructuredPrompt();
  const stable = renderStableContext(ctx);
  const volatile = renderVolatileContext(ctx);

  const response = await callWithRetry(() =>
    anthropic().messages.create({
      model: SONNET_MODEL,
      max_tokens: 160,
      temperature: 0.7,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
        { type: "text", text: stable, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: `${volatile}\n\n# Task\n\nPick the highest-ranked question from the bank that fits this run and hasn't been asked or answered. If nothing fits, respond with the literal string DEFER.`,
        },
      ],
    }),
  );

  const text =
    response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim() || "";
  if (!text || text.toUpperCase() === "DEFER") return null;
  return text;
}

/**
 * Picker-driven Question 2 generator. At debrief sync time `rpeValue`
 * is null, so the picker resolves to structured (weeks 1–2) or
 * conversational. The same function is reused on RPE submit (with
 * `rpeValue` populated) to evaluate whether the run merits an
 * RPE-branched replacement.
 */
export async function generateFollowUp(
  ctx: DebriefContext,
  athleteCreatedAt: string,
  rpeValue: number | null,
): Promise<{ pick: FollowUpPick; text: string | null }> {
  if (!pickerEnabled()) {
    const text = await generateConversationalFollowUp(ctx);
    return { pick: { type: "conversational" }, text };
  }

  const pick = pickFollowUp({
    activity: ctx.activity,
    arcRuns: ctx.arcRuns,
    athleteCreatedAt,
    rpeValue,
  });

  if (pick.type === "rpe_branched") {
    const text = await generateRpeBranchedFollowUp(ctx, pick.branch, pick.rpeValue);
    return { pick, text };
  }

  if (pick.type === "structured") {
    const text = await generateStructuredFollowUp(ctx);
    if (text) return { pick, text };
    const fallback = await generateConversationalFollowUp(ctx);
    return { pick: { type: "conversational" }, text: fallback };
  }

  const text = await generateConversationalFollowUp(ctx);
  return { pick, text };
}

/**
 * Full debrief generation: gate, body, follow-up. Does not persist — the
 * server action layer handles persistence and idempotency. The follow-up
 * is generated via the picker; at sync time the picker has no RPE
 * answer to consider, so it resolves to structured (weeks 1–2) or
 * conversational. RPE-branched follow-ups arrive later via
 * `regenerateFollowUpForRpeAnswer` when the athlete submits their RPE.
 */
export async function generateDebrief(ctx: DebriefContext): Promise<DebriefOutcome> {
  const skip = debriefGate(ctx.activity);
  if (skip) return { kind: "skip", reason: skip };

  const body = await generateDebriefBody(ctx);
  if (!body) return { kind: "skip", reason: "too_short" };

  // Follow-up runs independently; if it fails, the debrief still ships.
  let followUp: string | null = null;
  try {
    const result = await generateFollowUp(ctx, ctx.athleteCreatedAt, null);
    followUp = result.text;
  } catch (e) {
    console.warn("follow-up generation failed, debrief will ship without one", e);
  }

  return { kind: "debrief", body, followUp };
}
