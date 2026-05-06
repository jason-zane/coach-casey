import "server-only";

import type { CrossTrainingContext } from "@/lib/thread/cross-training-context";
import type { DebriefContext } from "@/lib/thread/debrief-context";
import type { WeeklyReviewContext } from "@/lib/thread/weekly-review-context";
import type { ChatStreamEvent } from "./chat";
import type { RpeBranch } from "./followup-picker";
import { formatPace } from "./context-render";

/**
 * Centralised mock implementations for every LLM-backed surface.
 * Mocks ship with the bundle and are exercised whenever
 * `ANTHROPIC_API_KEY` is unset or `LLM_MODE=mock` is set, which is the
 * default for local development without an API key.
 *
 * Every output here must obey the universal voice rules in
 * `_shared/voice/default.md` (no em-dashes, no exclamation marks, no
 * hype, no Markdown, second person). The voice-check eval script
 * exercises the deterministic outputs from this module to catch
 * regressions.
 */

// ---------------------------------------------------------------------------
// Mode resolution

/**
 * True when the runtime should serve mock outputs instead of calling
 * Anthropic. Reads `LLM_MODE` (explicit override, "mock" or "real") and
 * falls back to "no API key = mock" so local development does not need
 * a key to boot.
 */
export function mockMode(): boolean {
  if (process.env.LLM_MODE === "mock") return true;
  if (process.env.LLM_MODE === "real") return false;
  return !process.env.ANTHROPIC_API_KEY;
}

// ---------------------------------------------------------------------------
// Debrief and follow-up (one shape, two outputs)

export type MockDebriefOutput = {
  body: string;
  followUp: string | null;
};

export function mockDebrief(ctx: DebriefContext): MockDebriefOutput {
  const a = ctx.activity;
  const first = ctx.isFirstDebrief
    ? "First one I've read for you, so take this as a starting point rather than a full reading."
    : null;

  const lead = a.hasWorkoutShape
    ? `Workout shape today: ${a.laps.length} laps, pace spread of ${
        Math.max(...a.laps.map((l) => l.paceSPerKm ?? 0)) -
        Math.min(...a.laps.map((l) => l.paceSPerKm ?? 0))
      }s/km.`
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

// ---------------------------------------------------------------------------
// RPE-branched follow-up

export function mockRpeBranchedFollowUp(branch: RpeBranch, rpeValue: number): string {
  if (branch === "high_on_easy") {
    return `Came in higher than the shape of the run suggests, ${rpeValue} on something easy. What was going on?`;
  }
  return "Softer number than I'd have expected for that one. Conservative, or feeling sharp?";
}

// ---------------------------------------------------------------------------
// Cross-training acknowledgement

export function mockCrossTrainingAck(
  ctx: CrossTrainingContext,
  isSubstitution: boolean,
  knowledge: { typeLabel: string },
  formatDuration: (m: number | null) => string,
): string {
  const a = ctx.activity;
  const dur = formatDuration(a.durationMinutes);
  const titlePart = a.name && a.name.trim() ? `"${a.name.trim()}" ` : "";

  if (isSubstitution) {
    const niggle = ctx.injuries[0];
    const niggleLine = niggle
      ? ` ${niggle.tags[0] ?? "the niggle"} still talking?`
      : " Anything going on, or just shuffling things?";
    return `Saw the ${knowledge.typeLabel} today instead of the planned run.${niggleLine}`;
  }

  if (ctx.pattern.isPattern) {
    return `${ctx.pattern.description}, ${titlePart}${dur}.`;
  }
  return `${dur} ${titlePart}on the ${knowledge.typeLabel}.`;
}

// ---------------------------------------------------------------------------
// Onboarding validation observations

/**
 * Pre-canned observations for the onboarding flow when running without
 * an API key. Order is meaningful, the orchestrator hands one back per
 * call until exhausted, then signals `DONE`.
 */
export const MOCK_VALIDATION_OBSERVATIONS = [
  "You've been averaging about 55km a week over the last couple of months, with most weeks looking like five runs. Sundays read like your long day, Wednesdays look like the harder session. That match what you're running?",
  "Your easy days sit around 5:20/km, and the Wednesday workouts drop into the 4:10 to 4:20 range on average. HR stays down on the easy runs. Does that line up with what you're aiming for?",
  "Long runs have been creeping up, 22, 24, 28, then 32km a couple of weeks back. That read like the build you'd planned, or has it stretched further than intended?",
  "Looks like there's a week in the middle where the mileage drops right off, just a couple of short runs. Sick, travelling, or something else going on?",
  "One Saturday a few weeks back, what reads as an easy day came out closer to 4:58/km, a good chunk quicker than your usual easy. Group run, or feeling fresh?",
];

// ---------------------------------------------------------------------------
// Chat stream

/**
 * Streaming mock for chat. Yields the response in 20-char chunks so
 * the UI's stream rendering exercises the same code path as the real
 * stream. Picks a calf/knee-aware response when the user message
 * mentions either, else a generic check-in.
 */
/**
 * Deterministic weekly-review body for mock mode. Light enough to look
 * like a real review, structurally faithful to the prompt's required
 * shape (one-sentence opener + 3-5 short paragraphs, no markdown), and
 * passes the voice-check regex set.
 */
export function mockWeeklyReview(ctx: WeeklyReviewContext): string {
  const totalKm = ctx.weekRunKm.toFixed(1);
  const runCount = ctx.weekRunCount;
  if (runCount === 0 && ctx.weekCrossTraining.length === 0) {
    return "Quiet one. If that was deliberate, fold the reason into next week's read; if not, talk to me when you can.";
  }
  if (runCount === 0) {
    return `Cross-training only this week, ${ctx.weekCrossTraining.length} sessions, no runs. Easy week to read at the surface, harder to read underneath without the running data, so worth saying out loud how the body felt by Sunday.\n\nIn the four-week arc this lands as a deliberate dip rather than a drift, and the timing fits a pull-back week. Whatever sent the running away for the week, the cross-training kept the engine on.`;
  }
  const opener = `${runCount} runs this week, ${totalKm} km in the legs, the shape reads honestly against the four-week arc.`;
  const arcLine = ctx.arcWeeks.length
    ? `In the four-week arc this is a ${runCount >= 5 ? "build" : "hold"} week, the volume sitting where the prior weeks set you up to go.`
    : "Early in the picture I have of you, so I'm reading this week mostly on its own merits.";
  const planLine = ctx.activePlanText
    ? "The week mostly tracked the plan, the workout day landed where it was meant to and the long run came in within range."
    : "Without a plan to read against I'm reading the shape, not the prescription, and the shape is steady.";
  return `${opener}\n\n${arcLine}\n\n${planLine}\n\nNothing flagged that needs an answer right now. Talk to me if anything in the week felt off.`;
}

export async function* mockChatStream(userText: string): AsyncGenerator<ChatStreamEvent> {
  const lower = userText.toLowerCase();
  const response =
    lower.includes("calf") || lower.includes("knee")
      ? "Noted. I'll keep an eye on how that travels through the week. If it's still there on your next easy run, worth easing off the pace for a day or two and seeing if it settles."
      : "Heard. Anything specific on your mind, or just checking in?";
  for (const chunk of response.match(/.{1,20}(\s|$)/g) ?? [response]) {
    yield { type: "text", value: chunk };
    await new Promise((r) => setTimeout(r, 40));
  }
  yield { type: "done", fullText: response };
}
