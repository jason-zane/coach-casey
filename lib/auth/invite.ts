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
