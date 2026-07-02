import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { mayCreateAccount } from "@/lib/auth/invite";
import { INVITE_COOKIE, INVITE_COOKIE_PATH } from "@/lib/auth/invite-cookie";
import { notifyFounder } from "@/lib/notify";

/**
 * The invite gate, run right after any flow establishes a session:
 * /auth/callback (OAuth `?code=` and magic-link `?token_hash=`) and
 * verifyEmailCode (same-tab 6-digit code). It catches accounts minted by
 * surfaces that can't check the invite up front — Google OAuth has no
 * shouldCreateUser, and GoTrue's self-serve endpoints can be called directly
 * with the public anon key.
 *
 * Returns "ok" to let the sign-in proceed. Returns "refused" once the session
 * has been cleared — and the account deleted when it was minted around the
 * gate — in which case the caller sends the visitor to
 * /signin?error=invite_required. Pure admins (no athlete row) and
 * already-authorized athletes pass straight through.
 */
export async function enforceSignupGate(
  supabase: SupabaseClient,
  user: User,
): Promise<"ok" | "refused"> {
  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, signup_authorized_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete || athlete.signup_authorized_at) return "ok";

  // Unstamped athlete: authorize the account if the visitor is allowed to
  // create one (open signup, or the invite code signUpWithGoogle parked in
  // the cookie for the OAuth round-trip); otherwise remove it.
  const cookieStore = await cookies();
  const invite = cookieStore.get(INVITE_COOKIE)?.value;
  cookieStore.set(INVITE_COOKIE, "", { path: INVITE_COOKIE_PATH, maxAge: 0 });

  const admin = createAdminClient();
  const provider = user.app_metadata?.provider ?? "unknown";

  if (mayCreateAccount(invite)) {
    const { error } = await admin
      .from("athletes")
      .update({ signup_authorized_at: new Date().toISOString() })
      .eq("id", athlete.id);
    if (!error) {
      // Parity with the email flow's founder alert. Best-effort.
      await notifyFounder({
        subject: "New Coach Casey signup",
        text: `Someone signed up via ${provider}.\n\nEmail: ${user.email ?? "(unknown)"}`,
      });
      return "ok";
    }
    // Couldn't record the authorization. Don't delete an invited person's
    // account over a transient failure — refuse the session and let them
    // retry; the proxy blocks the unstamped account in the meantime.
    console.error("[auth] failed to authorize signup", error);
  } else {
    try {
      await admin.auth.admin.deleteUser(user.id);
    } catch (e) {
      // Deletion failed: the orphan account stays unstamped, so the proxy
      // and requireAthlete still refuse it everywhere.
      console.error("[auth] failed to delete uninvited signup", e);
    }
    // Lead signal for the founder: someone wanted in badly enough to try.
    // Best-effort.
    await notifyFounder({
      subject: "Blocked uninvited signup attempt",
      text: `Someone without an invite tried to sign in via ${provider} and was turned away.\n\nEmail: ${user.email ?? "(unknown)"}`,
    });
  }

  try {
    // Clear the session cookies the exchange just set. Local scope: the
    // user may already be deleted, so don't insist on a server-side revoke.
    await supabase.auth.signOut({ scope: "local" });
  } catch (e) {
    console.error("[auth] sign-out after refused signup failed", e);
  }
  return "refused";
}
