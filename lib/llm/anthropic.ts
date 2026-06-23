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
  // Internal passes, NOT athlete-facing voice: the weekly-review planner
  // (lead angle + continuity threads) and the consolidation pass (structured
  // interpreted-memory updates). Consolidation fires per debrief and per
  // substantial chat turn, so on Sonnet it is a second full-price call on
  // every chat turn, the prime cost target.
  //
  // We tried Haiku here. `pnpm eval:insights` caught a real regression:
  // Sonnet 4/4, Haiku 2/4. Haiku tags body parts more specifically ("left
  // calf" vs "calf"), and findRecurrence() in reconcile.ts matches on EXACT
  // tag equality, so Haiku's drift breaks recurrence detection, the headline
  // of the maintained read. Kept on Sonnet until the cost is addressed
  // another way (cache the consolidation system prompt + debounce per session)
  // or recurrence matching is made tolerant of tag granularity. Per-surface
  // usage is logged via logModelUsage so the cost of any model choice is
  // visible.
  weeklyReviewPlan: SONNET,
  consolidation: SONNET,
} as const;
