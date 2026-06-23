import "server-only";
import { getPostHogClient } from "@/lib/posthog-server";

/**
 * Per-surface LLM token-usage telemetry.
 *
 * Why this exists: spend is attributed by SURFACE and MODEL, not by raw
 * provider total. With every call site tagged we can see, e.g., that chat +
 * consolidation dominate, and decide per-surface which model to run (the
 * `MODELS` map in lib/llm/anthropic.ts is the one-line lever).
 *
 * Two design constraints:
 *   1. Zero hot-path impact. This runs AFTER a model call has returned (the
 *      usage numbers only exist then), is synchronous-cheap (one console line),
 *      mirrors to PostHog via a non-blocking enqueue, and NEVER throws. It
 *      cannot add latency to or disturb the response it is measuring.
 *   2. Provider-agnostic. We pass the actual model string used and read usage
 *      fields defensively, so this keeps working unchanged if a surface is
 *      flipped to another model or routed through OpenRouter (which mirrors the
 *      OpenAI-style `prompt_tokens` / `completion_tokens` shape).
 */

/** A usage object from any provider. Read defensively; all fields optional. */
export type ModelUsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  // OpenAI / OpenRouter naming, in case a surface is routed there later.
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
} | null | undefined;

function n(...vals: Array<number | null | undefined>): number {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

export function logModelUsage(args: {
  /** Stable surface key, e.g. "chat", "consolidation", "weekly-review". */
  surface: string;
  /** The model string actually sent to the provider for this call. */
  model: string;
  usage: ModelUsageLike;
  athleteId?: string | null;
}): void {
  try {
    const u = args.usage ?? {};
    const input = n(u.input_tokens, u.prompt_tokens);
    const output = n(u.output_tokens, u.completion_tokens);
    const cacheRead = n(u.cache_read_input_tokens);
    const cacheWrite = n(u.cache_creation_input_tokens);

    // Primary sink: a structured log line. Aggregatable with no external
    // dependency and provider-independent.
    console.info(
      `[llm-usage] surface=${args.surface} model=${args.model} ` +
        `in=${input} out=${output} cache_read=${cacheRead} cache_write=${cacheWrite}`,
    );

    // Secondary sink: PostHog for dashboards. capture() enqueues and returns
    // immediately (flush is async), so this does not block the caller.
    getPostHogClient().capture({
      distinctId: args.athleteId ?? "system",
      event: "llm_usage",
      properties: {
        surface: args.surface,
        model: args.model,
        input_tokens: input,
        output_tokens: output,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheWrite,
      },
    });
  } catch {
    // Observability must never disturb the path it is observing.
  }
}
