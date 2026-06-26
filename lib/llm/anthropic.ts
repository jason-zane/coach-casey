import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Provider: OpenRouter, always.
//
// Every model runs through OpenRouter's Anthropic-compatible Messages API, so
// the model is a runtime choice (LLM_MODELS, below) rather than a code edit,
// and we can fall back across models on a transient failure. The Anthropic SDK
// is pointed at OpenRouter; baseURL is ".../api" (the SDK appends "/v1/messages",
// which is OpenRouter's real route). There is no direct-Anthropic path anymore.

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      // Only reachable in "real" mode; mock mode never constructs the client.
      throw new Error(
        "OPENROUTER_API_KEY is not set. Set it to make real model calls, or run with LLM_MODE=mock.",
      );
    }
    client = new Anthropic({
      apiKey,
      baseURL: "https://openrouter.ai/api",
      defaultHeaders: { "X-Title": "coach-casey" },
    });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Model registry — the allowlist.
//
// Only models validated to work with the surfaces' Anthropic-Messages shape
// (system blocks, tool use, streaming) belong here. Adding a model is a
// deliberate act: add it here, run `pnpm eval` against it, THEN point
// LLM_MODELS at it. `caching` and `reasoning` document behaviour that affects
// cost and max_tokens budgeting — caching=false models ignore `cache_control`
// (so cache usage logs read 0); reasoning=true models emit thinking blocks and
// can truncate short answers under a low max_tokens.
type ModelInfo = { caching: boolean; reasoning: boolean; note: string };

export const MODEL_REGISTRY: Record<string, ModelInfo> = {
  "deepseek/deepseek-v4-flash": {
    caching: false,
    reasoning: true,
    note: "Default. Cheap and fast. Reasoning model; no Anthropic prompt caching.",
  },
  "deepseek/deepseek-v4-pro": {
    caching: false,
    reasoning: true,
    note: "Heavier DeepSeek reasoner. Watch max_tokens — its thinking can truncate short answers.",
  },
  "anthropic/claude-sonnet-4.6": {
    caching: true,
    reasoning: false,
    note: "Claude Sonnet via OpenRouter. Full prompt caching; highest voice quality.",
  },
  "anthropic/claude-haiku-4.5": {
    caching: true,
    reasoning: false,
    note: "Cheaper Claude via OpenRouter. Full prompt caching.",
  },
};

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

// ---------------------------------------------------------------------------
// Model chain — an ordered list from LLM_MODELS (comma-separated). The first
// entry is the default for every surface; the rest are fallbacks tried in order
// on a transient failure. Every entry must be in MODEL_REGISTRY, or we refuse
// to run (fail-fast at startup with a clear message — the "gate").

export function parseModelChain(raw: string | undefined): string[] {
  const entries = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const chain = entries.length > 0 ? entries : [DEFAULT_MODEL];
  const unknown = chain.filter((m) => !(m in MODEL_REGISTRY));
  if (unknown.length > 0) {
    throw new Error(
      `LLM_MODELS contains unsupported model(s): ${unknown.join(", ")}. ` +
        `Allowed: ${Object.keys(MODEL_REGISTRY).join(", ")}. ` +
        `Add a model to MODEL_REGISTRY in lib/llm/anthropic.ts and eval it before using it.`,
    );
  }
  return chain;
}

export const MODEL_CHAIN = parseModelChain(process.env.LLM_MODELS);
export const PRIMARY_MODEL = MODEL_CHAIN[0];

// ---------------------------------------------------------------------------
// Per-surface model selection. Every surface defaults to the primary; the map
// is kept so a single surface can be pinned to a different (registry) model in
// one line — e.g. putting the per-chat-turn consolidation pass on a cheaper
// model when the primary is an expensive one. logModelUsage records the model
// actually used per call, so the cost of any choice stays visible.
export const MODELS = {
  chat: PRIMARY_MODEL,
  debriefBody: PRIMARY_MODEL,
  debriefConversationalFollowUp: PRIMARY_MODEL,
  debriefStructuredFollowUp: PRIMARY_MODEL,
  stravaBlurb: PRIMARY_MODEL,
  crossTrainingAck: PRIMARY_MODEL,
  followupRpeBranched: PRIMARY_MODEL,
  raceWeekBriefing: PRIMARY_MODEL,
  fuelingPrerun: PRIMARY_MODEL,
  fuelingRetrospective: PRIMARY_MODEL,
  niggleEscalation: PRIMARY_MODEL,
  midBlockFlatness: PRIMARY_MODEL,
  onboardingValidation: PRIMARY_MODEL,
  weeklyReview: PRIMARY_MODEL,
  planExtract: PRIMARY_MODEL,
  weeklyReviewPlan: PRIMARY_MODEL,
  consolidation: PRIMARY_MODEL,
} as const;

// ---------------------------------------------------------------------------
// Ordered fallback for non-streaming calls.
//
// Tries the requested model first, then the remaining MODEL_CHAIN entries — but
// only on a TRANSIENT error (rate-limit / 5xx / network). A 4xx (bad request,
// auth) is a real bug, so it rethrows immediately rather than masking it behind
// a fallback. The streaming chat surface does not use this yet (clean mid-stream
// fallback is a separate problem); it runs on the primary model.

function isTransient(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status == null) return true; // network / unknown → retryable
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/**
 * Run `attempt` against each model in order until one succeeds. Stops early and
 * rethrows on a non-transient error. Pure of the SDK, so the fallback policy is
 * unit-testable without the network.
 */
export async function runWithFallback<T>(
  models: string[],
  attempt: (model: string) => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    try {
      return await attempt(models[i]);
    } catch (err) {
      lastErr = err;
      const hasMore = i < models.length - 1;
      if (!hasMore || !isTransient(err)) throw err;
    }
  }
  throw lastErr;
}

/**
 * Non-streaming model call with ordered fallback across MODEL_CHAIN. Drop-in for
 * `anthropic().messages.create`. The requested `params.model` is tried first,
 * then any other chain entries.
 */
export function createMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const ordered = [params.model, ...MODEL_CHAIN.filter((m) => m !== params.model)];
  return runWithFallback(ordered, (model) =>
    anthropic().messages.create({ ...params, model }),
  );
}
