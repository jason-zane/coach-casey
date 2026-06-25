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
  // Real mode needs a usable key for EITHER provider. Without the OpenRouter
  // check, switching to OpenRouter (and dropping ANTHROPIC_API_KEY) would
  // silently serve mocks instead of calling DeepSeek.
  return !process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY;
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
// Strava blurb (public one-line verdict)

/**
 * Deterministic verdict for the Strava description writeback. Must obey
 * the eavesdropping voice rules (no hype, no exclamations, no emoji,
 * second person) and stay under the 140-char prompt target; the
 * voice-check eval covers these strings via `scripts/eval-voice.mts`.
 */
export function mockStravaBlurb(ctx: DebriefContext): string {
  const a = ctx.activity;
  if (a.hasWorkoutShape) {
    return "Three reps, three of the same pace. That's not luck, that's pacing.";
  }
  if (ctx.arcWeeks.length > 0) {
    return "Held the line on an easy day. The unsexy move that makes Sunday's long run possible.";
  }
  return "An easy run that stayed easy. Underrated.";
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
    return `Cross-training only this week, ${ctx.weekCrossTraining.length} sessions, no runs. Hard to read the running when there isn't any, so the useful thing is how the body felt by Sunday. Whatever pulled the running for the week, the engine stayed on.`;
  }
  const opener = `${runCount} runs this week, ${totalKm} km in the legs, and it reads honestly for where you are.`;
  const trajLine = ctx.arcWeeks.length
    ? `It sits a little ${runCount >= 5 ? "above" : "below"} the recent weeks, and the legs look like they took it in stride.`
    : "Early in the picture I have of you, so I'm reading this one mostly on its own.";
  const planLine = ctx.activePlanText
    ? "The workout day landed where it was meant to and the long run came in within range."
    : "No plan to read against, so I'm reading the running itself, and it stays steady.";
  return `${opener}\n\n${trajLine}\n\n${planLine}\n\nNothing here needs an answer right now. Say so if any of it felt different from the inside.`;
}

// ---------------------------------------------------------------------------
// Casey refresh proactive surfaces (2026-05-16)

/**
 * Mock outputs for the five new proactive surfaces added in the
 * 2026-05-16 refresh. Each is deterministic and voice-clean (passes the
 * voice-check eval). Generators delegate to these when
 * `LLM_MODE=mock` or no API key is set.
 */

export type RaceWeekDayMarker = "T-14" | "T-10" | "T-7" | "T-3" | "T-2" | "T-1" | "T-0";

export function mockRaceWeekBriefing(input: {
  raceName: string | null;
  dayMarker: RaceWeekDayMarker;
  tier: "A" | "B" | "C";
}): string {
  const name = input.raceName ?? "your race";
  switch (input.dayMarker) {
    case "T-14":
      return `Two weeks to ${name}. Taper starts properly this week, and Sunday's long is the last real long before the race. Anything you want to nail down, pacing, fuelling, anything you're worried about?`;
    case "T-10":
      return `Ten days out from ${name}. Anything you want to nail down before the taper does its work?`;
    case "T-7":
      return `Race week. Taper feel right, or heavy legs? The Wednesday session is the last real test of the legs, treat it as the read, not as fitness work.`;
    case "T-3":
      return `Three days out. Carb load is on now, aim for the familiar foods, not the new ones. How's the sleep been this week?`;
    case "T-2":
      return `Two days. Most of the work is done. Tomorrow is the shake-out and the early-night day.`;
    case "T-1":
      return `Race day tomorrow. What's the morning plan, wake, breakfast, transport, start? And the early-mile call, opening on target, or holding behind?`;
    case "T-0":
      return `Race day. The early miles call is conservative, trust the build. Run the race that gets you to 30km with something left.`;
  }
}

export function mockFuelingPrerun(input: {
  hasKnownPattern: boolean;
  isInRaceBuild: boolean;
}): string {
  if (input.isInRaceBuild && input.hasKnownPattern) {
    return "Long run tomorrow, and you're inside the race build now. Worth rehearsing the race-day gel cadence on this one if you haven't yet.";
  }
  if (input.hasKnownPattern) {
    return "Long run tomorrow. Usual fuelling, or testing anything new?";
  }
  return "Long run tomorrow. What's the fuelling plan, gels, drinks, or running it empty?";
}

export function mockFuelingRetrospective(input: {
  hasKnownPattern: boolean;
}): string {
  if (input.hasKnownPattern) {
    return "Saw the long run on Sunday. Stuck with the usual fuelling, or shifted it?";
  }
  return "Saw the long run on Sunday. Did you take anything in, or run it empty? Worth knowing for next time.";
}

export function mockNiggleEscalation(input: {
  bodyPart: string;
  hasCoach: boolean;
}): string {
  const count = "Third time";
  const lead = `${count} the ${input.bodyPart} has come up in two weeks.`;
  if (input.hasCoach) {
    return `${lead} Same flavour, or shifting? Worth flagging to your coach if you haven't yet, they'll have the picture on the block.`;
  }
  return `${lead} Same flavour, or shifting? Worth getting a physio to look before it sets in.`;
}

export function mockMidBlockFlatness(input: {
  hasCoach: boolean;
  hasRecentLifeContext: boolean;
}): string {
  if (input.hasRecentLifeContext) {
    return "Workouts have come in flat the last three sessions, easy paces drifting slower. The life context you mentioned a couple of weeks back probably explains some of it. How's the body actually reading it?";
  }
  if (input.hasCoach) {
    return "Easy paces have drifted slower for ten days and the last workout didn't sit on target. Worth a word with your coach if it's been on your mind too.";
  }
  return "Last two weeks the easy runs have been heavier and the workouts have lost a bit of edge. Could be the build catching up, could be sleep or work pressure. How's the body actually reading it?";
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
