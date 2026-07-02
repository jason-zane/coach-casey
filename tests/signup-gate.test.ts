import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Source-level regression guards for the invite gate (prod audit, Jul 2026:
// Google OAuth minted accounts with zero invite). The gate is recorded on the
// athlete row as signup_authorized_at — stamped only by the service role from
// invite-checked flows — and enforced at three chokepoints: the auth
// callback (deletes), the proxy (blocks every matched request), and
// requireAthlete (blocks server actions). These tests pin that wiring so a
// refactor can't silently reopen the hole.

test("the signup gate is centralized in lib/auth/invite.ts", () => {
  const src = readFileSync("lib/auth/invite.ts", "utf8");
  // One flag opens signup everywhere.
  assert.match(src, /export function signupsOpen/);
  assert.match(src, /process\.env\.OPEN_SIGNUP === "true"/);
  assert.match(src, /export function mayCreateAccount/);
  assert.match(src, /signupsOpen\(\) \|\| isValidInviteCode\(code\)/);
});

test("email signup checks the central gate and stamps authorization", () => {
  const src = readFileSync("app/actions/auth.ts", "utf8");
  // The gate call, not a bare invite-code check, guards the send.
  assert.match(src, /if \(!mayCreateAccount\(code\)\)/);
  // The freshly created account is stamped through the service role, and a
  // stamp failure is fatal (otherwise the callback deletes the account when
  // the magic link is clicked).
  assert.match(src, /update\(\{ signup_authorized_at/);
  assert.match(src, /is\("signup_authorized_at", null\)/);
});

test("Google signup validates the invite before OAuth and parks it in a cookie", () => {
  const src = readFileSync("app/actions/auth.ts", "utf8");
  assert.match(src, /export async function signUpWithGoogle/);
  assert.match(src, /INVITE_COOKIE/);
  assert.match(src, /httpOnly: true/);
});

test("the post-session gate stamps invited accounts and deletes the rest", () => {
  const src = readFileSync("lib/auth/signup-gate.ts", "utf8");
  assert.match(src, /signup_authorized_at/);
  assert.match(src, /mayCreateAccount\(invite\)/);
  assert.match(src, /auth\.admin\.deleteUser/);
});

test("auth callback runs the gate on both exchange paths", () => {
  const src = readFileSync("app/auth/callback/route.ts", "utf8");
  assert.match(src, /invite_required/);
  // Both the ?code= (OAuth + PKCE magic link) and ?token_hash= (cross-device
  // magic link) branches must run the gate — GoTrue's /auth/v1/otp can mint
  // users directly with the anon key too.
  assert.equal(
    src.match(/enforceSignupGate\(supabase/g)?.length ?? 0,
    2,
    "both exchange branches must run the signup gate",
  );
});

test("same-tab code entry runs the gate too", () => {
  const src = readFileSync("app/actions/auth.ts", "utf8");
  // verifyEmailCode mints sessions without touching /auth/callback, so it
  // must enforce the same gate.
  assert.match(src, /enforceSignupGate\(supabase, data\.user\)/);
});

test("first-time admin sign-ins are stamped, not deleted", () => {
  const src = readFileSync("app/actions/admin-auth.ts", "utf8");
  // requestAdminMagicLink creates the account at send time
  // (shouldCreateUser: true); without the stamp the callback gate would
  // delete a brand-new admin on their first link click.
  assert.match(src, /update\(\{ signup_authorized_at/);
  assert.match(src, /is\("signup_authorized_at", null\)/);
});

test("proxy blocks unauthorized accounts on every matched request", () => {
  const src = readFileSync("lib/supabase/middleware.ts", "utf8");
  assert.match(src, /signup_authorized_at/);
  assert.match(src, /!athlete\.signup_authorized_at/);
  assert.match(src, /process\.env\.OPEN_SIGNUP !== "true"/);
  assert.match(src, /invite_required/);
});

test("requireAthlete blocks unauthorized accounts in server actions", () => {
  const src = readFileSync("app/actions/onboarding.ts", "utf8");
  assert.match(src, /signup_authorized_at/);
  assert.match(src, /!athlete\.signup_authorized_at && !signupsOpen\(\)/);
});

test("migration adds the authorization column and grandfathers existing athletes", () => {
  const sql = readFileSync(
    "supabase/migrations/20260703090000_signup_authorization.sql",
    "utf8",
  );
  assert.match(sql, /ADD COLUMN signup_authorized_at timestamptz/);
  // Existing accounts all came through the invite flow; without the backfill
  // the proxy would lock every one of them out on deploy.
  assert.match(sql, /SET signup_authorized_at = created_at/);
});
