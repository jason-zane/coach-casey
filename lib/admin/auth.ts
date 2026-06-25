import "server-only";
import { headers } from "next/headers";
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
 * Whether this request was issued from the desktop admin console (/admin)
 * rather than the in-app admin (/app/admin). A server action POSTs to the page
 * that fired it, so the Referer's path is the reliable signal. Used only to
 * pick the right sign-in surface when the gate fails; absent/odd Referer (and
 * every non-console caller) falls back to the app's surfaces.
 */
async function isConsoleRequest(): Promise<boolean> {
  try {
    const referer = (await headers()).get("referer");
    if (!referer) return false;
    const path = new URL(referer).pathname;
    return path === "/admin" || path.startsWith("/admin/");
  } catch {
    return false;
  }
}

/**
 * Returns the signed-in user when they're an admin, throws-redirects
 * otherwise. Used as the standard preamble for admin pages and admin server
 * actions. Failure redirects are context-aware: console callers go to
 * /admin/login, the in-app admin keeps /signin (no session) and /app
 * (signed-in impostor, so the admin route doesn't even confirm it exists).
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
    const redirect = (await isConsoleRequest()) ? "/admin/login" : "/signin";
    return { ok: false as const, redirect };
  }
  const email = typeof claims.email === "string" ? claims.email : null;
  if (!isAdminEmail(email)) {
    const redirect = (await isConsoleRequest()) ? "/admin/login" : "/app";
    return { ok: false as const, redirect };
  }
  return { ok: true as const, user: { id: claims.sub, email }, supabase };
}
