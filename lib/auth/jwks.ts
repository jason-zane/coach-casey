import "server-only";
import type { JWK } from "@supabase/supabase-js";

/**
 * Module-cached JSON Web Key Set for local access-token verification.
 *
 * `getClaims()` verifies the access token's ES256 signature in-process (no
 * round trip to the Auth server, unlike `getUser()`), but only when it already
 * holds the project's public signing keys. Its built-in key cache lives on the
 * Supabase *client instance*, and we mint a fresh client per request, so left
 * to itself it would re-fetch the JWKS over the network on every call and erase
 * the saving. This module holds the keys once per server instance (Fluid
 * Compute reuses instances across requests) behind a short TTL, and we hand
 * them to `getClaims` so signature verification stays purely local.
 *
 * Failure is soft: if the fetch ever fails we return whatever we last had (or
 * an empty set), and the caller falls back to `getClaims`' own fetch / to
 * `getUser`. Correctness never depends on this cache, only speed.
 */

const JWKS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
const TTL_MS = 10 * 60 * 1000;

let cache: { keys: JWK[]; fetchedAt: number } | null = null;

export async function getSigningKeys(): Promise<JWK[]> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.keys;
  try {
    // `next.revalidate` lets the platform's data cache also serve this across
    // instances, so a cold start rarely pays the full network cost.
    const res = await fetch(JWKS_URL, { next: { revalidate: 600 } });
    if (!res.ok) return cache?.keys ?? [];
    const data = (await res.json()) as { keys?: JWK[] };
    if (data.keys && data.keys.length > 0) {
      cache = { keys: data.keys, fetchedAt: Date.now() };
    }
  } catch {
    // Network hiccup: keep serving the last known keys, if any.
  }
  return cache?.keys ?? [];
}
