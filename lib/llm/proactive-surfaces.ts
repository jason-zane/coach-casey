import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, SONNET_MODEL } from "./anthropic";
import { buildSystemPrompt } from "./prompts";
import {
  mockFuelingPrerun,
  mockFuelingRetrospective,
  mockMidBlockFlatness,
  mockMode,
  mockNiggleEscalation,
  mockRaceWeekBriefing,
  type RaceWeekDayMarker,
} from "./mocks";
import { logVoiceFindings } from "./voice-check";

/**
 * Generators for the five proactive surfaces added in the 2026-05-16
 * Casey refresh. Each follows the same shape as `weekly-review.ts`:
 *
 *   1. Take a context object (built by the caller from DB rows).
 *   2. If mock mode, return the deterministic mock output.
 *   3. Otherwise compose the system prompt + a per-call user message
 *      and call Sonnet.
 *   4. Run the body through `logVoiceFindings` (the same voice gate the
 *      other surfaces use), then return.
 *
 * Each surface returns either a body string or `null` (when the prompt
 * elects to skip). The persistence path is in `app/actions/*` so
 * generators stay pure-LLM and free of `next/server` imports.
 */

export const RACE_WEEK_BRIEFING_PROMPT_VERSION = "race-week-briefing@v1";
export const FUELING_PRERUN_PROMPT_VERSION = "fueling-prerun@v1";
export const FUELING_RETROSPECTIVE_PROMPT_VERSION = "fueling-retrospective@v1";
export const NIGGLE_ESCALATION_PROMPT_VERSION = "niggle-escalation@v1";
export const MID_BLOCK_FLATNESS_PROMPT_VERSION = "mid-block-flatness@v1";

// ---------------------------------------------------------------------------
// Shared helper

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Race-week briefing

export type RaceWeekContext = {
  athleteId: string;
  displayName: string | null;
  raceName: string | null;
  raceDate: string;
  daysUntil: number;
  dayMarker: RaceWeekDayMarker;
  tier: "A" | "B" | "C";
  recentRunsSummary: string;
  recentLifeContext: string;
  hasCoach: boolean;
};

export async function generateRaceWeekBriefing(
  ctx: RaceWeekContext,
): Promise<string | null> {
  if (mockMode()) {
    const body = mockRaceWeekBriefing({
      raceName: ctx.raceName,
      dayMarker: ctx.dayMarker,
      tier: ctx.tier,
    });
    logVoiceFindings(body, {
      surface: "race-week-briefing",
      athleteId: ctx.athleteId,
      athleteName: ctx.displayName,
    });
    return body;
  }

  const system = await buildSystemPrompt({
    surface: "race-week-briefing.md",
    posture: "coachedVsUncoached",
    shared: ["demographics"],
  });

  const userBlock = [
    `# Race`,
    `Name: ${ctx.raceName ?? "(unnamed race)"}`,
    `Date: ${ctx.raceDate}`,
    `Tier: ${ctx.tier}`,
    `Days until: ${ctx.daysUntil} (marker ${ctx.dayMarker})`,
    `Has coach: ${ctx.hasCoach ? "yes" : "no"}`,
    ``,
    `# Recent runs (last 2 weeks)`,
    ctx.recentRunsSummary || "(no runs in window)",
    ``,
    `# Recent life context`,
    ctx.recentLifeContext || "(none on file)",
    ``,
    `# Task`,
    `Produce the race-week briefing for ${ctx.dayMarker}. Follow the shape rules in the surface prompt. Output prose only, or the literal string SKIP if this day-marker is not in the schedule for this tier.`,
  ].join("\n");

  const response = await anthropic().messages.create({
    model: SONNET_MODEL,
    max_tokens: 400,
    temperature: 0.9,
    system,
    messages: [{ role: "user", content: userBlock }],
  });

  const body = extractText(response);
  if (!body || body.toUpperCase() === "SKIP") return null;

  logVoiceFindings(body, {
    surface: "race-week-briefing",
    athleteId: ctx.athleteId,
    athleteName: ctx.displayName,
  });
  return body;
}

// ---------------------------------------------------------------------------
// Fuelling pre-run nudge

export type FuelingPrerunContext = {
  athleteId: string;
  displayName: string | null;
  /** Local-date string of the planned long run, e.g. "Sunday". */
  plannedRunDay: string;
  plannedDurationMinutes: number;
  plannedRunVariant: "long" | "mp-long" | "depleted" | "hard-long" | null;
  knownFuelingPattern: string | null;
  goalRaceDaysAway: number | null;
  hasCoach: boolean;
};

export async function generateFuelingPrerunNudge(
  ctx: FuelingPrerunContext,
): Promise<string | null> {
  // Surface fit-filter: only fire on runs > 75 min.
  if (ctx.plannedDurationMinutes <= 75) return null;

  const isInRaceBuild =
    ctx.goalRaceDaysAway != null &&
    ctx.goalRaceDaysAway >= 14 &&
    ctx.goalRaceDaysAway <= 56;
  const hasKnownPattern = !!ctx.knownFuelingPattern;

  if (mockMode()) {
    const body = mockFuelingPrerun({ hasKnownPattern, isInRaceBuild });
    logVoiceFindings(body, {
      surface: "fueling-prerun",
      athleteId: ctx.athleteId,
      athleteName: ctx.displayName,
    });
    return body;
  }

  const system = await buildSystemPrompt({
    surface: "fueling-prerun.md",
    posture: "coachedVsUncoached",
  });

  const userBlock = [
    `# Planned long run`,
    `Day: ${ctx.plannedRunDay}`,
    `Duration: ${ctx.plannedDurationMinutes} min`,
    `Variant: ${ctx.plannedRunVariant ?? "long"}`,
    ``,
    `# Known fuelling pattern`,
    ctx.knownFuelingPattern ?? "(none captured yet)",
    ``,
    `# Race build`,
    isInRaceBuild
      ? `Yes, race in ${ctx.goalRaceDaysAway} days.`
      : "Not currently in a race build window.",
    ``,
    `# Coach status`,
    ctx.hasCoach ? "Athlete has a human coach." : "Self-directed.",
    ``,
    `# Task`,
    `Produce one short pre-run fuelling nudge for the planned long run. Output prose only, or the literal string SKIP if the surface should not fire (pattern well-established and run is routine).`,
  ].join("\n");

  const response = await anthropic().messages.create({
    model: SONNET_MODEL,
    max_tokens: 160,
    temperature: 0.9,
    system,
    messages: [{ role: "user", content: userBlock }],
  });

  const body = extractText(response);
  if (!body || body.toUpperCase() === "SKIP") return null;

  logVoiceFindings(body, {
    surface: "fueling-prerun",
    athleteId: ctx.athleteId,
    athleteName: ctx.displayName,
  });
  return body;
}

// ---------------------------------------------------------------------------
// Fuelling retrospective check

export type FuelingRetrospectiveContext = {
  athleteId: string;
  displayName: string | null;
  runDay: string;
  runDurationMinutes: number;
  runDistanceKm: number;
  knownFuelingPattern: string | null;
  hasCoach: boolean;
};

export async function generateFuelingRetrospective(
  ctx: FuelingRetrospectiveContext,
): Promise<string | null> {
  // Surface fit-filter: only fire on runs > 75 min.
  if (ctx.runDurationMinutes <= 75) return null;

  const hasKnownPattern = !!ctx.knownFuelingPattern;

  if (mockMode()) {
    const body = mockFuelingRetrospective({ hasKnownPattern });
    logVoiceFindings(body, {
      surface: "fueling-retrospective",
      athleteId: ctx.athleteId,
      athleteName: ctx.displayName,
    });
    return body;
  }

  const system = await buildSystemPrompt({
    surface: "fueling-retrospective.md",
    posture: "coachedVsUncoached",
  });

  const userBlock = [
    `# Completed run`,
    `Day: ${ctx.runDay}`,
    `Duration: ${ctx.runDurationMinutes} min`,
    `Distance: ${ctx.runDistanceKm.toFixed(1)} km`,
    ``,
    `# Known fuelling pattern`,
    ctx.knownFuelingPattern ?? "(none captured yet)",
    ``,
    `# Coach status`,
    ctx.hasCoach ? "Athlete has a human coach." : "Self-directed.",
    ``,
    `# Task`,
    `Produce one short retrospective fuelling check for the run. Output prose only, or the literal string SKIP.`,
  ].join("\n");

  const response = await anthropic().messages.create({
    model: SONNET_MODEL,
    max_tokens: 160,
    temperature: 0.9,
    system,
    messages: [{ role: "user", content: userBlock }],
  });

  const body = extractText(response);
  if (!body || body.toUpperCase() === "SKIP") return null;

  logVoiceFindings(body, {
    surface: "fueling-retrospective",
    athleteId: ctx.athleteId,
    athleteName: ctx.displayName,
  });
  return body;
}

// ---------------------------------------------------------------------------
// Niggle escalation

export type NiggleEscalationContext = {
  athleteId: string;
  displayName: string | null;
  bodyPart: string;
  mentionsInWindow: number;
  windowDays: number;
  recentMentions: string[];
  hasCoach: boolean;
};

export async function generateNiggleEscalation(
  ctx: NiggleEscalationContext,
): Promise<string | null> {
  if (mockMode()) {
    const body = mockNiggleEscalation({
      bodyPart: ctx.bodyPart,
      hasCoach: ctx.hasCoach,
    });
    logVoiceFindings(body, {
      surface: "niggle-escalation",
      athleteId: ctx.athleteId,
      athleteName: ctx.displayName,
    });
    return body;
  }

  const system = await buildSystemPrompt({
    surface: "niggle-escalation.md",
    posture: "coachedVsUncoached",
  });

  const userBlock = [
    `# Niggle pattern`,
    `Body part: ${ctx.bodyPart}`,
    `Mentions in last ${ctx.windowDays} days: ${ctx.mentionsInWindow}`,
    `Has coach: ${ctx.hasCoach ? "yes" : "no"}`,
    ``,
    `# Recent mentions`,
    ctx.recentMentions.map((m, i) => `${i + 1}. ${m}`).join("\n") || "(none)",
    ``,
    `# Task`,
    `Produce the niggle-escalation message. Output prose only.`,
  ].join("\n");

  const response = await anthropic().messages.create({
    model: SONNET_MODEL,
    max_tokens: 220,
    temperature: 0.9,
    system,
    messages: [{ role: "user", content: userBlock }],
  });

  const body = extractText(response);
  if (!body) return null;

  logVoiceFindings(body, {
    surface: "niggle-escalation",
    athleteId: ctx.athleteId,
    athleteName: ctx.displayName,
  });
  return body;
}

// ---------------------------------------------------------------------------
// Mid-block flatness check-in

export type MidBlockFlatnessContext = {
  athleteId: string;
  displayName: string | null;
  patternDescription: string;
  recentLifeContext: string;
  goalRaceDaysAway: number | null;
  hasCoach: boolean;
};

export async function generateMidBlockFlatness(
  ctx: MidBlockFlatnessContext,
): Promise<string | null> {
  if (mockMode()) {
    const body = mockMidBlockFlatness({
      hasCoach: ctx.hasCoach,
      hasRecentLifeContext: ctx.recentLifeContext.trim().length > 0,
    });
    logVoiceFindings(body, {
      surface: "mid-block-flatness",
      athleteId: ctx.athleteId,
      athleteName: ctx.displayName,
    });
    return body;
  }

  const system = await buildSystemPrompt({
    surface: "mid-block-flatness.md",
    posture: "coachedVsUncoached",
  });

  const userBlock = [
    `# Pattern detected`,
    ctx.patternDescription,
    ``,
    `# Recent life context`,
    ctx.recentLifeContext || "(none on file)",
    ``,
    `# Race context`,
    ctx.goalRaceDaysAway != null
      ? `Goal race in ${ctx.goalRaceDaysAway} days.`
      : "No goal race in the calendar.",
    ``,
    `# Coach status`,
    ctx.hasCoach ? "Athlete has a human coach." : "Self-directed.",
    ``,
    `# Task`,
    `Produce the mid-block flatness check-in. Output prose only.`,
  ].join("\n");

  const response = await anthropic().messages.create({
    model: SONNET_MODEL,
    max_tokens: 260,
    temperature: 0.9,
    system,
    messages: [{ role: "user", content: userBlock }],
  });

  const body = extractText(response);
  if (!body) return null;

  logVoiceFindings(body, {
    surface: "mid-block-flatness",
    athleteId: ctx.athleteId,
    athleteName: ctx.displayName,
  });
  return body;
}
