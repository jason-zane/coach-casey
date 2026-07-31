import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

export { clientIpFromHeaders } from "./client-ip";

// ~30 requests/minute/IP. Generous for the legitimate reporter (a render error
// boundary fires at most a handful of times per page load) but low enough that
// a sprayer cannot bloat error_events.
export const OBSERVABILITY_RATE_LIMIT = 30;
export const OBSERVABILITY_RATE_WINDOW_MS = 60 * 1000;

type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Durable, cross-instance per-IP fixed-window limiter for anonymous endpoints.
 * Mirrors the chat limiter (consume_chat_rate_limit) but keys on a SHA-256 of
 * the client IP -- a plain text key with no athletes FK -- so it works for
 * unauthenticated callers and never stores a raw IP at rest. The RPC does the
 * read-modify-write atomically, so concurrent requests cannot overshoot.
 *
 * Fails OPEN: a limiter outage (DB blip, missing migration, absent IP header)
 * must not break legitimate error reporting, so on any error -- or a null IP --
 * we allow the request through.
 */
export async function consumeIpRateLimit(
  ip: string | null,
  limit: number = OBSERVABILITY_RATE_LIMIT,
  windowMs: number = OBSERVABILITY_RATE_WINDOW_MS,
): Promise<RateLimitResult> {
  if (!ip) return { ok: true };

  const windowSeconds = Math.ceil(windowMs / 1000);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_ip_rate_limit", {
      p_ip_hash: createHash("sha256").update(ip).digest("hex"),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed: boolean; retry_after_seconds: number }
      | null
      | undefined;

    if (row && row.allowed === false) {
      return {
        ok: false,
        retryAfterSeconds: row.retry_after_seconds || windowSeconds,
      };
    }
    return { ok: true };
  } catch (e) {
    console.error("[observability] ip rate limit check failed, allowing", e);
    return { ok: true };
  }
}
