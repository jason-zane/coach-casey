import Anthropic from "@anthropic-ai/sdk";

// Provider selection. With OPENROUTER_API_KEY set we point the (otherwise
// unchanged) Anthropic SDK at OpenRouter's Anthropic-compatible Messages API
// and run DeepSeek; with no OpenRouter key we talk to Anthropic directly. The
// switch is gated purely on the key being present, so removing it reverts to
// the original Anthropic path with no other edits.
//
// baseURL is ".../api", NOT ".../api/v1": the SDK appends "/v1/messages"
// itself, which lands on OpenRouter's real route (verified: POST
// openrouter.ai/api/v1/messages exists; the same path one level deeper 404s).
const USE_OPENROUTER = Boolean(process.env.OPENROUTER_API_KEY);

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    client = USE_OPENROUTER
      ? new Anthropic({
          apiKey: process.env.OPENROUTER_API_KEY,
          baseURL: "https://openrouter.ai/api",
          defaultHeaders: { "X-Title": "coach-casey" },
        })
      : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// The two model slots, resolved per provider. SONNET is the primary,
// voice-facing slot; HAIKU is the cheaper/faster standby. On Anthropic they
// are Sonnet 4.6 / Haiku 4.5. On OpenRouter BOTH resolve to DeepSeek v4 Flash:
// the surface eval showed Flash holds Casey's voice as well as v4 Pro, runs to
// completion (Pro's heavier reasoning truncated debrief answers under the same
// max_tokens), and costs ~8x less. To put a single surface on the heavier
// reasoner, use "deepseek/deepseek-v4-pro" directly in the MODELS map. Names
// are kept so the map and its rationale below read unchanged.
export const HAIKU = USE_OPENROUTER ? "deepseek/deepseek-v4-flash" : "claude-haiku-4-5";
export const SONNET = USE_OPENROUTER ? "deepseek/deepseek-v4-flash" : "claude-sonnet-4-6";

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
