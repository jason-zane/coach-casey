import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_MS } from "./security";

type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Durable, cross-instance chat rate limit. Calls the consume_chat_rate_limit
 * RPC, which does the read-modify-write atomically. The in-memory limiter it
 * replaces only held per-instance, so it could be bypassed under Fluid Compute
 * concurrency and reset on cold start.
 *
 * Fails OPEN: a rate-limiter outage (DB blip, missing migration) must not take
 * down chat, so on any error we log and allow the request through.
 */
export async function consumeChatRateLimit(
  athleteId: string,
): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_chat_rate_limit", {
      p_athlete_id: athleteId,
      p_limit: CHAT_RATE_LIMIT,
      p_window_seconds: Math.ceil(CHAT_RATE_WINDOW_MS / 1000),
    });
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed: boolean; retry_after_seconds: number }
      | null
      | undefined;

    if (row && row.allowed === false) {
      return {
        ok: false,
        retryAfterSeconds:
          row.retry_after_seconds || Math.ceil(CHAT_RATE_WINDOW_MS / 1000),
      };
    }
    return { ok: true };
  } catch (e) {
    console.error("[chat] durable rate limit check failed, allowing", e);
    return { ok: true };
  }
}
