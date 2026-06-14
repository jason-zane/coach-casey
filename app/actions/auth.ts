"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isValidInviteCode } from "@/lib/auth/invite";
import { notifyFounder } from "@/lib/notify";
import { pushAdmins } from "@/lib/admin/notify-admins";

export type AuthState =
  | { error: string }
  | { success: true }
  | null;

export async function signInWithEmail(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/app");
}

export async function signUpWithEmail(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "");

  // Early-access gate. Re-checked here server-side (not just hidden in the UI)
  // so the access code is genuinely required to create an account.
  if (!isValidInviteCode(code)) {
    return {
      error:
        "Coach Casey is invite-only right now. Use your invite link, or email hello@coachcasey.app to request access.",
    };
  }

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Best-effort founder alert. Awaited (so it fires before the redirect throws)
  // but never allowed to break signup.
  await notifyFounder({
    subject: "New Coach Casey signup",
    text: `Someone just created a Coach Casey account.\n\nEmail: ${email}\nConfirmed immediately: ${data.session ? "yes" : "no (email confirmation pending)"}`,
  });

  // If email confirmation is off (Supabase project setting), signUp returns a
  // session and the user is already logged in, go straight into onboarding.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/onboarding");
  }

  // Otherwise the user needs to click the confirmation email first.
  return { success: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export async function signInWithGoogle() {
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
