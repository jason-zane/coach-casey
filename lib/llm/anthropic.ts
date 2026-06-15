import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// Available models. Exported so a surface can be switched with a one-line
// edit in the MODELS map below. HAIKU powers the internal reasoning and
// extraction passes (weekly-review planning, consolidation); the
// athlete-facing voice surfaces all run on Sonnet.
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
  // The two passes below are internal (reasoning + structured extraction),
  // not athlete-facing voice, so the all-Sonnet decision above does not
  // target them. They run on Haiku to keep cost in check: consolidation
  // fires per debrief and per substantial chat turn. Flip either to SONNET
  // for sharper angle-picking / fewer mis-consolidated beliefs at higher cost.
  //
  // weeklyReviewPlan picks the lead angle + continuity threads before the
  // weekly-review writer drafts.
  weeklyReviewPlan: HAIKU,
  // consolidation maintains the interpreted-memory layer (the working read).
  consolidation: HAIKU,
} as const;
