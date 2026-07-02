"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { mayCreateAccount } from "@/lib/auth/invite";
import { INVITE_COOKIE, INVITE_COOKIE_PATH } from "@/lib/auth/invite-cookie";
import { notifyFounder } from "@/lib/notify";
import { pushAdmins } from "@/lib/admin/notify-admins";
import { SITE_URL } from "@/lib/site-url";

export type AuthState =
  | { sent: true; email: string }
  | { error: string }
  | { success: true }
  | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Every email/OAuth flow lands on /auth/callback, which verifies the token and
// forwards to `next`. We always point athletes at /app; the proxy's onboarding
// gate (lib/supabase/middleware.ts) sends incomplete accounts on to /onboarding,
// so one target serves both brand-new and returning users.
async function appCallbackUrl(): Promise<string> {
  const origin = (await headers()).get("origin") ?? SITE_URL;
  return `${origin}/auth/callback?next=${encodeURIComponent("/app")}`;
}

/**
 * Sign in an existing account with a one-tap magic link. Coach Casey is
 * passwordless: there is no password to enter or reset. `shouldCreateUser` is
 * false so this surface can never mint an account — unknown addresses get the
 * same "check your email" response with no link sent, so it can't be used to
 * probe who already has an account. New users come through the invite-gated
 * sign-up path below.
 */
export async function requestSignInLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: await appCallbackUrl(),
    },
  });
  // Swallow send errors (e.g. "user not found", rate limits) into the generic
  // response so we never reveal whether the address has an account.
  if (error) {
    console.error("[auth] sign-in magic link send failed (non-fatal)", error);
  }

  return { sent: true, email };
}

/**
 * Sign-up magic link. Early access is invite-gated: the code is re-checked
 * here server-side (not just hidden in the UI), and only then do we send a link
 * that creates the account on click. The magic link itself confirms the email,
 * so there's no separate confirmation step.
 */
export async function requestSignUpLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const code = String(formData.get("code") ?? "");

  // Early-access gate. Re-checked here server-side so the access code is
  // genuinely required to create an account (until OPEN_SIGNUP flips).
  if (!mayCreateAccount(code)) {
    return {
      error:
        "Coach Casey is invite-only right now. Use your invite link, or email hello@coachcasey.app to request access.",
    };
  }

  if (!email || !EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: await appCallbackUrl(),
    },
  });

  if (error) {
    return { error: error.message };
  }

  // The user (and their athlete row, via the DB trigger) now exists, so mark
  // the account as having come through the gate. Without this stamp the auth
  // callback and the proxy treat the account as minted around the invite
  // check and refuse it — so a stamp failure is fatal, not best-effort.
  // Retrying signup stamps the already-created user and heals it.
  const { error: stampError } = await createAdminClient()
    .from("athletes")
    .update({ signup_authorized_at: new Date().toISOString() })
    .eq("email", email)
    .is("signup_authorized_at", null);
  if (stampError) {
    console.error("[auth] failed to authorize signup", stampError);
    return { error: "Something went wrong on our end. Please try again." };
  }

  // Best-effort founder alert. Awaited so it fires before we return, but never
  // allowed to break the sign-up (notifyFounder swallows its own errors).
  await notifyFounder({
    subject: "New Coach Casey signup",
    text: `Someone signed up by email.\n\nEmail: ${email}`,
  });

  return { sent: true, email };
}

/**
 * Early-access request. The public site has no open signup; visitors leave
 * their details here and the founder emails them an invite link back. No
 * account is created. Best-effort email; the requester always sees success
 * once their details validate (we don't leak whether the alert sent).
 *
 * `company` is a honeypot: a hidden field real users never fill. If it has a
 * value, treat as a bot and no-op (still report success).
 */
export async function requestAccess(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (String(formData.get("company") ?? "").trim()) {
    return { success: true };
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);

  if (!email || !EMAIL_RE.test(email)) {
    return { error: "Enter a valid email so we can send your link." };
  }

  // Persist the request so it shows up in the admin surface. Best-effort:
  // a DB hiccup must not stop the notifications or the user's confirmation.
  try {
    const admin = createAdminClient();
    await admin.from("access_requests").insert({
      name: name || null,
      email,
      note: note || null,
    });
  } catch (e) {
    console.error("[access] failed to persist request (non-fatal)", e);
  }

  // Notify the founder: email (reliable) + push (instant on device).
  const summary = name ? `${name} (${email})` : email;
  await Promise.all([
    notifyFounder({
      subject: `Early-access request: ${name || email}`,
      text: [
        "Someone asked for early access to Coach Casey.",
        "",
        `Name:  ${name || "(not given)"}`,
        `Email: ${email}`,
        note ? `\nNote:\n${note}` : "",
        "",
        "Manage it in the admin surface:",
        "https://www.coachcasey.app/app/admin/access",
      ].join("\n"),
      replyTo: email,
    }),
    pushAdmins({
      title: "New early-access request",
      body: summary,
      tag: "access-request",
      url: "/app/admin/access",
    }),
  ]);

  return { success: true };
}

/**
 * Sign in an existing account with Google. This surface can't be prevented
 * from minting an account (OAuth has no shouldCreateUser), so the invite gate
 * runs after the fact: /auth/callback deletes any account this creates unless
 * signups are open or the visitor carried an invite (signUpWithGoogle below).
 */
export async function signInWithGoogle() {
  return startGoogleOAuth();
}

/**
 * Create an account with Google from the invite-gated signup page. The code
 * is validated server-side before OAuth starts, then parked in a short-lived
 * httpOnly cookie so it survives the round-trip through Google — the auth
 * callback re-validates it before authorizing the new account.
 */
export async function signUpWithGoogle(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  // The signup page only renders the Google button behind a valid code, so a
  // failure here is a tampered request; bounce to the request-access view.
  if (!mayCreateAccount(code)) {
    redirect("/signup");
  }

  (await cookies()).set(INVITE_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: INVITE_COOKIE_PATH,
    maxAge: 600,
  });

  return startGoogleOAuth();
}

async function startGoogleOAuth() {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      // Force the Google account picker on every sign-in, even when the user
      // is already signed into one Google account. Lets you pick a different
      // account or review what you're authorizing, and removes the "instant
      // redirect" feel that makes the flow look broken.
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error) {
    redirect(`/signin?error=${encodeURIComponent(error.message)}`);
  }

  if (data.url) {
    redirect(data.url);
  }
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/signin");
}
