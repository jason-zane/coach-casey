import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, SONNET_MODEL } from "./anthropic";
import { buildSystemPrompt } from "./prompts";
import {
  formatPace,
  renderActivePlanBlock,
  renderAthleteBlock,
  renderGoalRacesBlock,
  renderMemoryItemsBlock,
} from "./context-render";
import { mockDebrief, mockMode } from "./mocks";
import { logVoiceFindings } from "./voice-check";
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
  | {
      kind: "debrief";
      body: string;
      followUp: string | null;
      stravaBlurb: string | null;
    }
  | { kind: "skip"; reason: DebriefSkipReason };

export const STRAVA_BLURB_SIGNATURE =
  "coached by Coach Casey · coachcasey.app";

// Verdict cap is 140 chars per prompt spec. Allow some slack for the model
// occasionally going slightly long; reject anything past this absolute cap
// rather than silently posting it to the athlete's public Strava feed.
const STRAVA_BLURB_MAX_CHARS = 200;

const ABORTED_NAME_TOKENS = ["abort", "dnf", "stopped", "cut short"];

/**
 * Gate an activity before the LLM sees it. Handles §2.3 edge cases:
 * non-run activities, aborted activities, and pathologically short runs.
 * Very short legitimate runs (recovery jogs, cooldowns) fall through, the
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

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
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
  const parts: string[] = [
    renderAthleteBlock({
      displayName: ctx.displayName,
      sex: ctx.sex,
      ageYears: ctx.ageYears,
      weightKg: ctx.weightKg,
    }),
  ];

  const goalBlock = renderGoalRacesBlock(ctx.goalRaces);
  if (goalBlock) parts.push(goalBlock);

  const planBlock = renderActivePlanBlock(ctx.activePlanText, { fallback: "omit" });
  if (planBlock) parts.push(planBlock);

  const injuriesBlock = renderMemoryItemsBlock("Known injuries and niggles", ctx.injuries, {
    limit: 20,
    withNoted: true,
    emptyFallback: "none-on-file",
  });
  if (injuriesBlock) parts.push(injuriesBlock);

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

  // Recently asked follow-up questions. The structured-question picker
  // ranks against this so the same question doesn't appear on every run;
  // the conversational and RPE-branched paths see it for the same reason.
  if (ctx.priorFollowUps.length > 0) {
    const lines = ctx.priorFollowUps
      .map((f) => `- [${f.createdAt.slice(0, 10)}] ${f.body.replace(/\n/g, " ")}`)
      .join("\n");
    parts.push(
      `# Recently asked follow-up questions (do not re-ask any of these)\n${lines}`,
    );
  } else {
    parts.push(
      "# Recently asked follow-up questions\nNone yet. Any question is fair game.",
    );
  }

  return parts.join("\n\n");
}

function renderRpeHistory(ctx: DebriefContext): string {
  if (ctx.rpeHistory.length === 0) {
    return "(no RPE answers in the trailing 28 days, the athlete hasn't engaged with the prompt yet, or this is early in the trial.)";
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

  const lifeBlock = renderMemoryItemsBlock(
    ctx.lifeContext.length > 0 ? "Recent life context (last 14 days)" : "Recent life context",
    ctx.lifeContext,
    {
      limit: 15,
      dateLeading: true,
      emptyFallback: "none-logged",
    },
  );
  if (lifeBlock) parts.push(lifeBlock);

  return parts.join("\n\n");
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

  const stable = renderStableContext(ctx);
  const volatile = renderVolatileContext(ctx);
  const system = await buildSystemPrompt({
    surface: "post-run-debrief.md",
    posture: "interpretive",
    shared: ["heartRate", "demographics"],
    context: stable,
  });

  const response = await callWithRetry(() =>
    anthropic().messages.create({
      model: SONNET_MODEL,
      max_tokens: 900,
      temperature: 1.0,
      system,
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
  logVoiceFindings(text, {
    surface: "post-run-debrief",
    athleteId: ctx.athleteId,
    athleteName: ctx.displayName,
  });
  return text;
}

/**
 * Conversational follow-up, the long-running default. Generated per-run
 * based on what's notable about the activity. Returns `null` when the
 * prompt elects to `SKIP` rather than ask a generic question.
 */
export async function generateConversationalFollowUp(
  ctx: DebriefContext,
): Promise<string | null> {
  if (mockMode()) return mockDebrief(ctx).followUp;

  const stable = renderStableContext(ctx);
  const volatile = renderVolatileContext(ctx);
  const system = await buildSystemPrompt({
    surface: "post-run-followup-conversational.md",
    posture: "interpretive",
    context: stable,
  });

  const response = await callWithRetry(() =>
    anthropic().messages.create({
      model: SONNET_MODEL,
      max_tokens: 160,
      temperature: 0.9,
      system,
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
  logVoiceFindings(text, {
    surface: "post-run-followup-conversational",
    athleteId: ctx.athleteId,
    athleteName: ctx.displayName,
  });
  return text;
}

/**
 * Structured follow-up, picks from the ranked question bank in
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

  const stable = renderStableContext(ctx);
  const volatile = renderVolatileContext(ctx);
  const system = await buildSystemPrompt({
    surface: "post-run-followup-structured.md",
    posture: "interpretive",
    context: stable,
  });

  const response = await callWithRetry(() =>
    anthropic().messages.create({
      model: SONNET_MODEL,
      max_tokens: 160,
      temperature: 0.7,
      system,
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
  logVoiceFindings(text, {
    surface: "post-run-followup-structured",
    athleteId: ctx.athleteId,
    athleteName: ctx.displayName,
  });
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
 * Strava blurb, one dry sentence appended to the athlete's Strava
 * activity description. Public-facing; the prompt enforces the voice and
 * the 140-char target. We hard-cap at `STRAVA_BLURB_MAX_CHARS` here as a
 * backstop, anything longer is dropped rather than posted.
 *
 * Returns `null` on any failure or if the model produces empty/oversized
 * text. The caller treats `null` as "skip the description update" so a
 * blurb miss never blocks the debrief itself.
 */
export async function generateStravaBlurb(ctx: DebriefContext): Promise<string | null> {
  if (mockMode()) return mockDebrief(ctx).stravaBlurb;

  const stable = renderStableContext(ctx);
  const volatile = renderVolatileContext(ctx);
  const system = await buildSystemPrompt({
    surface: "strava-blurb.md",
    voice: "eavesdropping",
    context: stable,
  });

  const response = await callWithRetry(() =>
    anthropic().messages.create({
      model: SONNET_MODEL,
      max_tokens: 120,
      temperature: 1.0,
      system,
      messages: [
        {
          role: "user",
          content: `${volatile}\n\n# Task\n\nWrite the one-sentence Verdict for the run described above. Output the verdict text only, no signature.`,
        },
      ],
    }),
  );

  const raw =
    response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim() || "";

  // Models occasionally wrap output in quotes despite the prompt;
  // strip a single matched pair if present.
  const unquoted = raw.replace(/^[\"'“‘]+|[\"'”’]+$/g, "").trim();
  if (!unquoted) return null;
  if (unquoted.length > STRAVA_BLURB_MAX_CHARS) return null;
  logVoiceFindings(unquoted, {
    surface: "strava-blurb",
    athleteId: ctx.athleteId,
    profile: "eavesdropping",
    athleteName: ctx.displayName,
  });
  if (!passesStravaBlurbVoiceCheck(unquoted)) return null;
  return unquoted;
}

/**
 * Hard tripwire on voice failures the prompt shouldn't produce but
 * occasionally will. This output lands on the athlete's *public* Strava
 * feed, so a single hype line slipping through is materially worse than
 * a missed blurb. On any tripwire we drop the blurb entirely (the caller
 * treats `null` as skip-the-Strava-write) and the next debrief gets
 * another shot.
 *
 * Filters: exclamation points, hashtags, emoji (Extended_Pictographic),
 * a few canonical hype phrases, and the meta-leaks `Verdict:` or
 * `Output:` prefixes that occasionally bleed in from the prompt.
 */
function passesStravaBlurbVoiceCheck(text: string): boolean {
  if (/[!]/.test(text)) return false;
  if (/#\w/.test(text)) return false;
  if (/^\s*(verdict|output|response)\s*[:\-]/i.test(text)) return false;
  if (/\p{Extended_Pictographic}/u.test(text)) return false;
  if (
    /\b(crushed it|smashed it|killed it|nailed it|let'?s go|great job|amazing|awesome|legend|champion)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Full debrief generation: gate, body, follow-up, Strava blurb. Does not
 * persist, the server action layer handles persistence, idempotency,
 * and the Strava description update. The follow-up is generated via the
 * picker; at sync time the picker has no RPE answer to consider, so it
 * resolves to structured (weeks 1–2) or conversational. RPE-branched
 * follow-ups arrive later via `regenerateFollowUpForRpeAnswer` when the
 * athlete submits their RPE.
 *
 * Both the follow-up and Strava blurb are best-effort, a failure in
 * either does not block the debrief from shipping.
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

  // Strava blurb runs independently as well, a missing blurb just means
  // we don't update the Strava description for this activity.
  let stravaBlurb: string | null = null;
  try {
    stravaBlurb = await generateStravaBlurb(ctx);
  } catch (e) {
    console.warn("strava blurb generation failed, debrief will ship without one", e);
  }

  return { kind: "debrief", body, followUp, stravaBlurb };
}
