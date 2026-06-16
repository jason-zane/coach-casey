import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// Available models. Exported so a surface can be switched with a one-line
// edit in the MODELS map below. HAIKU is currently unused but kept on hand
// so any surface can be flipped to it if its cost or latency becomes a
// concern.
export const HAIKU = "claude-haiku-4-5";
export const SONNET = "claude-sonnet-4-6";

// Per-surface model selection.
//
// All surfaces run on Sonnet 4.6 (founder decision: prioritise voice quality
// across the board over the cost/latency savings of Haiku). The HAIKU constant
// is kept so any individual surface can be flipped back if its cost or latency
// becomes a concern; the voice eval (`pnpm eval:voice`) is the arbiter.
export const MODELS = {
  chat: SONNET,
  debriefBody: SONNET,
  debriefConversationalFollowUp: SONNET,
  debriefStructuredFollowUp: SONNET,
  stravaBlurb: SONNET,
  crossTrainingAck: SONNET,
  followupRpeBranched: SONNET,
  raceWeekBriefing: SONNET,
  fuelingPrerun: SONNET,
  fuelingRetrospective: SONNET,
  niggleEscalation: SONNET,
  midBlockFlatness: SONNET,
  onboardingValidation: SONNET,
  weeklyReview: SONNET,
  planExtract: SONNET,
  // Internal passes, not athlete-facing voice: the weekly-review planner
  // (lead angle + continuity threads) and the consolidation pass (structured
  // interpreted-memory updates). On Sonnet for quality, like everything else;
  // consolidation fires per debrief and per substantial chat turn, so it is
  // the one to watch on cost.
  weeklyReviewPlan: SONNET,
  consolidation: SONNET,
} as const;
