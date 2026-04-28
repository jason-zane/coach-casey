import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, SONNET_MODEL } from "./anthropic";
import type {
  CrossTrainingActivity,
  CrossTrainingContext,
  CrossTrainingMemoryItem,
  CrossTrainingPattern,
} from "@/lib/thread/cross-training-context";

export const CROSS_TRAINING_PROMPT_VERSION = "cross-training-acknowledgement@v1";

export type CrossTrainingSkipReason =
  | "is_run"
  | "ambient_only"
  | "missing_data"
  | "duplicate_activity";

export type CrossTrainingOutcome =
  | { kind: "ack"; body: string; isSubstitution: boolean }
  | { kind: "skip"; reason: CrossTrainingSkipReason };

/**
 * Per-activity knowledge base. Drawn from `docs/cross-training.md §5`.
 * Passed into the prompt as substrate, not parroted in output. Kept out of
 * the system prompt itself so a knowledge base edit doesn't bump the prompt
 * version, the system prompt teaches *how* to use the knowledge base; the
 * knowledge base itself is variable input.
 *
 * First-pass content; expected to be rewritten in Jason's coaching voice
 * before launch (see `docs/cross-training.md §22`).
 */
const KNOWLEDGE_BASE: Record<
  string,
  {
    typeLabel: string;
    loadProfile: string;
    typicalUseCases: string;
    interpretationPatterns: string;
  }
> = {
  Ride: {
    typeLabel: "ride",
    loadProfile:
      "Aerobic, low impact. Easy spinning is genuinely recovery-promoting (light venous return, low neuromuscular cost). Hard riding is real cardiovascular load that shows up in subsequent runs as fatigue, sometimes for 24-48 hours.",
    typicalUseCases:
      "Recovery the day after a hard run. Aerobic supplement on a non-run day. Substitute for a run when injured or managing load.",
    interpretationPatterns:
      "Easy ride day after long run is recovery-positive. Hard ride is real load worth flagging. Ride replacing a planned run is the most common substitution and worth asking about.",
  },
  VirtualRide: {
    typeLabel: "ride (Zwift / indoor)",
    loadProfile:
      "Same as outdoor ride but typically more controlled, Zwift sessions tend to be either deliberately easy or structured intervals, less middle-ground noodling.",
    typicalUseCases: "Same as outdoor ride. Often the chosen format when weather or time is tight.",
    interpretationPatterns:
      "Read the same way as outdoor rides. Title often carries more signal (workout names, FTP %).",
  },
  EBikeRide: {
    typeLabel: "e-bike ride",
    loadProfile:
      "Light. E-assist offloads most cardiovascular cost. Treat as ambient activity, not training load.",
    typicalUseCases: "Commuting, errands, social riding.",
    interpretationPatterns:
      "Acknowledge briefly. Do not read training implications into it unless duration is unusually long.",
  },
  Swim: {
    typeLabel: "swim",
    loadProfile:
      "Aerobic, zero impact, full-body. Cardiovascular load without the running impact cost. Often used for active recovery or when the legs need a break.",
    typicalUseCases:
      "Active recovery. Aerobic supplement. Substitute for a run when impact-loaded injuries (calf, foot, shin) flare.",
    interpretationPatterns:
      "Swim on a recovery day is low cost. Swim replacing a planned run almost always means impact is being managed, flag and ask, with calf/shin/foot history making the question pointed. Long open-water swims are real cardiovascular load.",
  },
  Workout: {
    typeLabel: "gym",
    loadProfile:
      "Highly variable. Heavy lower-body strength is genuinely costly to the legs and shows up the next day. Upper-body or light maintenance work is not. Strava data alone (duration, HR) is a weak signal; the title sometimes helps.",
    typicalUseCases:
      "Strength supplement (typical for serious marathon runners). Injury prevention or rehab. Sometimes pure habit unrelated to running.",
    interpretationPatterns:
      "Day before a key session is worth asking about (heavy legs the day before tempo matters). Pattern session, don't over-interrogate. Unusually long or HR-elevated session is worth flagging.",
  },
  WeightTraining: {
    typeLabel: "gym",
    loadProfile:
      "Same as Workout. Strava distinguishes WeightTraining from Workout but the practical reading is identical.",
    typicalUseCases: "Same as Workout.",
    interpretationPatterns: "Same as Workout.",
  },
  Yoga: {
    typeLabel: "yoga",
    loadProfile:
      "Low cost in most forms. Restorative or yin-style is recovery-promoting. Vinyasa or power yoga has real cardiovascular and muscular load and shouldn't be treated as zero-cost.",
    typicalUseCases:
      "Mobility, recovery, stress management. Sometimes prescribed for injury prevention.",
    interpretationPatterns:
      "Pattern session, acknowledge, ask what they're working on if context is thin. After a hard run is recovery-positive. Replacing a run often signals dialling back, niggle, fatigue, or life stress.",
  },
  Pilates: {
    typeLabel: "pilates",
    loadProfile:
      "Similar to yoga, low to moderate, depending on style. Reformer pilates can be more loading than mat. Generally low impact, focused on core and stabilisers.",
    typicalUseCases: "Core work, injury prevention, rehab. Often prescribed by physios.",
    interpretationPatterns:
      "Same shape as yoga. Acknowledge, ask if context is thin, watch for substitution patterns.",
  },
};

const CATCH_ALL_ENTRY = {
  typeLabel: "non-run activity",
  loadProfile:
    "Unknown to the marathon coach lens. Treat honestly, this is not a discipline you coach, and the relationship to running may not be readable from this data alone.",
  typicalUseCases: "Variable. Could be sport, hobby, social activity, recovery.",
  interpretationPatterns:
    "Acknowledge the activity. Note honestly when the running connection is unclear. Do not invent interpretation. Light question is fine; over-interpreting is not.",
};

function knowledgeFor(activityType: string | null) {
  if (!activityType) return CATCH_ALL_ENTRY;
  return KNOWLEDGE_BASE[activityType] ?? CATCH_ALL_ENTRY;
}

function formatDuration(minutes: number | null): string {
  if (minutes == null) return "duration not recorded";
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes - h * 60);
    return `${h}h${m > 0 ? `${m}m` : ""}`;
  }
  return `${Math.round(minutes)} min`;
}

function renderActivity(a: CrossTrainingActivity): string {
  const lines: string[] = [];
  lines.push(`- Type: ${a.activityType ?? "(unknown)"}`);
  lines.push(`- Day: ${a.dayOfWeek}`);
  lines.push(
    `- Started: ${new Date(a.date).toISOString().slice(11, 16)} (athlete local)`,
  );
  lines.push(`- Title: ${a.name && a.name.trim() ? a.name : "(untitled)"}`);
  lines.push(`- Duration: ${formatDuration(a.durationMinutes)}`);
  if (a.distanceKm != null && a.distanceKm > 0) {
    lines.push(`- Distance: ${a.distanceKm.toFixed(2)} km`);
  } else {
    lines.push("- Distance: not recorded");
  }
  lines.push(a.avgHr ? `- Average HR: ${a.avgHr} bpm` : "- Average HR: not recorded");
  if (a.maxHr) lines.push(`- Max HR: ${a.maxHr} bpm`);
  if (a.elevGainM != null && a.elevGainM > 0) {
    lines.push(`- Elevation gain: ${Math.round(a.elevGainM)} m`);
  }
  return lines.join("\n");
}

function renderMemoryItems(items: CrossTrainingMemoryItem[], heading: string, empty: string): string {
  if (items.length === 0) return `# ${heading}\n${empty}`;
  const lines = items
    .slice(0, 12)
    .map(
      (m) =>
        `- [${m.createdAt.slice(0, 10)}] ${m.content}${m.tags.length ? ` (${m.tags.join(", ")})` : ""}`,
    )
    .join("\n");
  return `# ${heading}\n${lines}`;
}

function renderRecentRuns(ctx: CrossTrainingContext): string {
  if (ctx.recentRuns.length === 0) {
    return "# Recent runs (running picture)\n(no recent runs in the arc window)";
  }
  const lines = ctx.recentRuns.slice(0, 10).map((r) => {
    const date = r.date.slice(0, 10);
    const dow = new Date(r.date).toLocaleString("en-US", { weekday: "short" });
    const hr = r.avgHr ? ` HR ${r.avgHr}` : "";
    const pace = r.paceSPerKm ? `, ${formatPace(r.paceSPerKm)}` : "";
    return `- ${date} (${dow}): ${r.name ?? "Run"}, ${r.distanceKm.toFixed(1)} km${pace}${hr}`;
  });
  return `# Recent runs (running picture)\n${lines.join("\n")}`;
}

function formatPace(secPerKm: number | null | undefined): string {
  if (!secPerKm) return "n/a";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function renderPattern(pattern: CrossTrainingPattern): string {
  if (!pattern.isPattern || !pattern.description) {
    return "# Pattern\nNo established pattern for this activity on this day-of-week.";
  }
  return `# Pattern\n${pattern.description}`;
}

function renderStableContext(ctx: CrossTrainingContext): string {
  const parts: string[] = [];
  parts.push(`# Athlete\n${ctx.displayName ?? "(unnamed)"}`);
  if (ctx.activePlanText) {
    parts.push(`# Active training plan\n${ctx.activePlanText.trim()}`);
  } else {
    parts.push("# Active training plan\nNo plan uploaded.");
  }
  parts.push(renderMemoryItems(ctx.injuries, "Active injuries and niggles", "None on file."));
  return parts.join("\n\n");
}

function renderVolatileContext(
  ctx: CrossTrainingContext,
  isSubstitution: boolean,
): string {
  const parts: string[] = [];
  parts.push(`# The cross-training session\n${renderActivity(ctx.activity)}`);
  parts.push(renderPattern(ctx.pattern));
  parts.push(renderRecentRuns(ctx));
  parts.push(
    renderMemoryItems(
      ctx.lifeContext,
      "Recent life context (last 14 days)",
      "Nothing logged.",
    ),
  );

  const kb = knowledgeFor(ctx.activity.activityType);
  parts.push(
    [
      `# Knowledge base entry, ${kb.typeLabel}`,
      `Load profile: ${kb.loadProfile}`,
      `Typical use cases: ${kb.typicalUseCases}`,
      `Interpretation patterns: ${kb.interpretationPatterns}`,
    ].join("\n"),
  );

  parts.push(
    `# Variant\n${
      isSubstitution
        ? "SUBSTITUTION, a run was planned for this day. Apply the substitution-aware shape from the system prompt."
        : "STANDARD, no planned run is being substituted. Apply the standard shape from the system prompt."
    }`,
  );

  return parts.join("\n\n");
}

let cachedSystemPrompt: string | null = null;
async function loadSystemPrompt(): Promise<string> {
  if (!cachedSystemPrompt) {
    const p = path.join(process.cwd(), "prompts/cross-training-acknowledgement.md");
    cachedSystemPrompt = await readFile(p, "utf8");
  }
  return cachedSystemPrompt;
}

function mockMode(): boolean {
  if (process.env.LLM_MODE === "mock") return true;
  if (process.env.LLM_MODE === "real") return false;
  return !process.env.ANTHROPIC_API_KEY;
}

function mockAck(ctx: CrossTrainingContext, isSubstitution: boolean): string {
  const a = ctx.activity;
  const kb = knowledgeFor(a.activityType);
  const dur = formatDuration(a.durationMinutes);
  const titlePart = a.name && a.name.trim() ? `"${a.name.trim()}" ` : "";

  if (isSubstitution) {
    const niggle = ctx.injuries[0];
    const niggleLine = niggle
      ? ` ${niggle.tags[0] ?? "the niggle"} still talking?`
      : " Anything going on, or just shuffling things?";
    return `Saw the ${kb.typeLabel} today instead of the planned run.${niggleLine}`;
  }

  if (ctx.pattern.isPattern) {
    return `${ctx.pattern.description}, ${titlePart}${dur}.`;
  }
  return `${dur} ${titlePart}on the ${kb.typeLabel}.`;
}

type CallWithRetryOpts = { attempts?: number; baseDelayMs?: number };

async function callWithRetry<T>(
  fn: () => Promise<T>,
  { attempts = 2, baseDelayMs = 500 }: CallWithRetryOpts = {},
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
 * Generate a cross-training acknowledgement body. Does not persist.
 * `isSubstitution` is decided upstream, the prompt branches on it via
 * the variant marker injected into the volatile context block.
 *
 * Substitution detection is dormant in V1 (no structured planned_sessions
 * table yet), so callers will pass `isSubstitution: false` until plan
 * extraction ships.
 */
export async function generateCrossTrainingAck(
  ctx: CrossTrainingContext,
  { isSubstitution = false }: { isSubstitution?: boolean } = {},
): Promise<CrossTrainingOutcome> {
  if (mockMode()) {
    return {
      kind: "ack",
      body: mockAck(ctx, isSubstitution),
      isSubstitution,
    };
  }

  const system = await loadSystemPrompt();
  const stable = renderStableContext(ctx);
  const volatile = renderVolatileContext(ctx, isSubstitution);

  const response = await callWithRetry(() =>
    anthropic().messages.create({
      model: SONNET_MODEL,
      max_tokens: 350,
      temperature: 1.0,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
        { type: "text", text: stable, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: `${volatile}\n\n# Task\n\nWrite the acknowledgement for the cross-training session described above. Output the body only, plain prose, with no follow-up question on a separate line. Length per the system prompt, short.`,
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

  if (!text) {
    return { kind: "skip", reason: "missing_data" };
  }

  return { kind: "ack", body: text, isSubstitution };
}
