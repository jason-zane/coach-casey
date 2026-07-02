import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { EmailOtpType, SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { mayCreateAccount } from "@/lib/auth/invite";
import { INVITE_COOKIE, INVITE_COOKIE_PATH } from "@/lib/auth/invite-cookie";
import { safeNextPath } from "@/lib/security/redirects";
import { notifyFounder } from "@/lib/notify";

/**
 * Single auth landing for every email/OAuth flow:
 *   - `code`        → OAuth (Google) and PKCE code exchange (password signup
 *                     confirmation).
 *   - `token_hash`  → magic-link / OTP verification (admin sign-in). Verified
 *                     server-side, so it works even cross-device.
 * `next` is validated to an internal path; on failure we send the visitor back
 * to whichever sign-in surface they came from (admin vs the main app).
 *
 * This is also where the invite gate catches accounts minted by surfaces that
 * can't check it up front: Google OAuth (no shouldCreateUser), and GoTrue's
 * self-serve endpoints called directly with the public anon key. Any session
 * whose athlete row was never stamped signup_authorized_at is refused — and
 * the just-minted account deleted — unless signups are open or the visitor
 * carried a valid invite through the round-trip (see signUpWithGoogle).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createClient();

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      return (
        (await refuseUnauthorizedSignup(supabase, data.user, origin)) ??
        NextResponse.redirect(`${origin}${next}`)
      );
    }
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error && data.user) {
      return (
        (await refuseUnauthorizedSignup(supabase, data.user, origin)) ??
        NextResponse.redirect(`${origin}${next}`)
      );
    }
  }

  const failPath = next.startsWith("/admin") ? "/admin/login" : "/signin";
  return NextResponse.redirect(`${origin}${failPath}?error=auth_failed`);
}

/**
 * The invite gate. Returns null to let the sign-in proceed; returns the
 * refusal redirect after deleting the account when it was minted around the
 * gate. Pure admins (no athlete row) and already-authorized athletes pass
 * straight through.
 */
async function refuseUnauthorizedSignup(
  supabase: SupabaseClient,
  user: User,
  origin: string,
): Promise<NextResponse | null> {
  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, signup_authorized_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete || athlete.signup_authorized_at) return null;

  // Unstamped athlete: this session's account was created by a surface that
  // couldn't check the gate first. Authorize it if the visitor is allowed to
  // create an account (open signup, or the invite code that signUpWithGoogle
  // parked in the cookie); otherwise remove it.
  const cookieStore = await cookies();
  const invite = cookieStore.get(INVITE_COOKIE)?.value;
  cookieStore.set(INVITE_COOKIE, "", { path: INVITE_COOKIE_PATH, maxAge: 0 });

  const admin = createAdminClient();

  if (mayCreateAccount(invite)) {
    const { error } = await admin
      .from("athletes")
      .update({ signup_authorized_at: new Date().toISOString() })
      .eq("id", athlete.id);
    if (!error) {
      // Parity with the email flow's founder alert. Best-effort.
      await notifyFounder({
        subject: "New Coach Casey signup",
        text: `Someone signed up with Google.\n\nEmail: ${user.email ?? "(unknown)"}`,
      });
      return null;
    }
    // Couldn't record the authorization. Don't delete an invited person's
    // account over a transient failure — refuse the session and let them
    // retry; the proxy blocks the unstamped account in the meantime.
    console.error("[auth] failed to authorize OAuth signup", error);
  } else {
    try {
      await admin.auth.admin.deleteUser(user.id);
    } catch (e) {
      // Deletion failed: the orphan account stays unstamped, so the proxy
      // and requireAthlete still refuse it everywhere.
      console.error("[auth] failed to delete uninvited signup", e);
    }
    // Lead signal for the founder: someone wanted in badly enough to try
    // Google. Best-effort.
    await notifyFounder({
      subject: "Blocked uninvited signup attempt",
      text: `Someone without an invite tried to sign in with Google and was turned away.\n\nEmail: ${user.email ?? "(unknown)"}`,
    });
  }

  try {
    // Clear the session cookies the exchange just set. Local scope: the
    // user may already be deleted, so don't insist on a server-side revoke.
    await supabase.auth.signOut({ scope: "local" });
  } catch (e) {
    console.error("[auth] sign-out after refused signup failed", e);
  }
  return NextResponse.redirect(`${origin}/signin?error=invite_required`);
}
