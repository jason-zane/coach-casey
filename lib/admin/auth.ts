import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSigningKeys } from "@/lib/auth/jwks";

/**
 * Admin gate. Source of truth: the `ADMIN_EMAILS` env var, comma-separated,
 * case-insensitive against the signed-in user's auth email. Empty / unset
 * = nobody. Deliberately env-driven rather than DB-driven so:
 *
 *  1. There's no in-app surface to elevate someone to admin (so a
 *     compromised athlete account can't grant itself admin via UI).
 *  2. Adding or removing an admin is a single Vercel env edit + redeploy,
 *     no migration, no SQL.
 *
 * Server-only by design. Never expose admin status to the client beyond
 * "you can see /app/admin" (a 404 redirect for non-admins covers that).
 */

export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = adminEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(email.toLowerCase());
}

/**
 * Returns the signed-in user when they're an admin, throws-redirects
 * otherwise. Used as the standard preamble for admin pages and admin
 * server actions. Sends would-be admins to /signin and would-be
 * impostors to /app (so the admin route doesn't even confirm it exists).
 */
export async function requireAdmin() {
  const supabase = await createClient();
  // Local ES256 verification (cached JWKS) instead of a getUser() round trip;
  // the proxy already revalidated this request's session. See lib/auth/current.ts.
  const keys = await getSigningKeys();
  const { data } = await supabase.auth.getClaims(
    undefined,
    keys.length ? { jwks: { keys } } : undefined,
  );
  const claims = data?.claims;
  if (!claims?.sub) {
    return { ok: false as const, redirect: "/signin" as const };
  }
  const email = typeof claims.email === "string" ? claims.email : null;
  if (!isAdminEmail(email)) {
    return { ok: false as const, redirect: "/app" as const };
  }
  return { ok: true as const, user: { id: claims.sub, email }, supabase };
}
