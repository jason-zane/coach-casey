import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * During early access, signup is gated behind a shared access code. The founder
 * shares a link (https://www.coachcasey.app/signup?code=THECODE) with the
 * people invited to test; the code is checked server-side before any account
 * is created.
 *
 * Fail-closed: if SIGNUP_ACCESS_CODE is unset, no code validates, so signup is
 * closed to everyone (existing users can still sign in). A missing env var
 * degrades to "invite-only, nobody new" rather than "wide open".
 */
export function isValidInviteCode(code: string | undefined | null): boolean {
  const expected = process.env.SIGNUP_ACCESS_CODE?.trim();
  if (!expected) return false;
  const given = (code ?? "").trim();
  // Length check first: timingSafeEqual throws on length mismatch.
  if (!given || given.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * THE early-access switch. Flipping OPEN_SIGNUP=true is the single change
 * that opens signup to everyone: the signup page shows the account form
 * without a code, the email flow stops requiring one, and the auth callback
 * authorizes fresh Google/OAuth accounts. Until then, mayCreateAccount()
 * requires a valid invite code.
 *
 * The gate is enforced on the athlete row (signup_authorized_at), not just in
 * the UI flows: accounts can be minted straight against the Supabase Auth API
 * with the public anon key (Google OAuth, /auth/v1/otp), so every
 * invite-checked flow stamps the row via the service role, and the auth
 * callback (app/auth/callback), the proxy (lib/supabase/middleware.ts), and
 * requireAthlete all refuse accounts that never got stamped.
 *
 * The proxy reads OPEN_SIGNUP inline instead of importing this module — it
 * has to stay out of server-only bundles — so keep the env var name in sync
 * with lib/supabase/middleware.ts.
 */
export function signupsOpen(): boolean {
  return process.env.OPEN_SIGNUP === "true";
}

/** May a visitor carrying `code` (possibly none) create an account? */
export function mayCreateAccount(code: string | undefined | null): boolean {
  return signupsOpen() || isValidInviteCode(code);
}
