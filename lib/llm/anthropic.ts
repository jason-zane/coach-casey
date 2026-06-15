import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const HAIKU = "claude-haiku-4-5";
const SONNET = "claude-sonnet-4-6";

// Per-surface model selection.
//
// Sonnet keeps the two surfaces where its lead is concrete: weekly review
// (multi-day synthesis, runs once/week so cost is bounded) and plan extract
// (vision + structured PDF extraction, a wrong plan ripples for weeks).
// Everything else is short-to-medium voice-matched prose conditioned on
// structured context, which Haiku 4.5 handles well at roughly a third of
// the cost and 2-3x lower latency. Voice eval (`pnpm eval:voice`) is the
// arbiter: if a surface regresses on Haiku, flip its key back to SONNET.
export const MODELS = {
  chat: HAIKU,
  debriefBody: HAIKU,
  debriefConversationalFollowUp: HAIKU,
  debriefStructuredFollowUp: HAIKU,
  stravaBlurb: HAIKU,
  crossTrainingAck: HAIKU,
  followupRpeBranched: HAIKU,
  raceWeekBriefing: HAIKU,
  fuelingPrerun: HAIKU,
  fuelingRetrospective: HAIKU,
  niggleEscalation: HAIKU,
  midBlockFlatness: HAIKU,
  onboardingValidation: HAIKU,
  // Cheap planning pass that picks the lead angle + continuity threads
  // before the Sonnet writer drafts the weekly review. Reasoning, not
  // voice, so Haiku is the right tier.
  weeklyReviewPlan: HAIKU,
  // Consolidation pass that maintains the interpreted-memory layer (the
  // working read). Structured tool output, not voice; Haiku tier.
  consolidation: HAIKU,
  weeklyReview: SONNET,
  planExtract: SONNET,
} as const;
