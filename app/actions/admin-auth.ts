"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin/auth";
import { SITE_URL } from "@/lib/site-url";

export type AdminAuthState =
  | { sent: true; email: string }
  | { error: string }
  | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Admin sign-in via Supabase magic link. The email is checked against the
 * ADMIN_EMAILS allowlist *before* a link is ever sent, so this path can't be
 * used to create or probe non-admin accounts, and the response is identical
 * whether or not the address is an admin (it never reveals who's on the
 * allowlist). The link lands on /auth/callback and is redirected to /admin,
 * where the middleware re-checks the allowlist as the real gate.
 */
export async function requestAdminMagicLink(
  _prev: AdminAuthState,
  formData: FormData,
): Promise<AdminAuthState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }

  if (isAdminEmail(email)) {
    const supabase = await createClient();
    const origin = (await headers()).get("origin") ?? SITE_URL;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${origin}/auth/callback?next=/admin`,
      },
    });
    // Swallow send errors into the generic response: surfacing "user not
    // found" / rate-limit details here would leak allowlist membership.
    if (error) {
      console.error("[admin-auth] magic link send failed (non-fatal)", error);
    }
  }

  return { sent: true, email };
}

/** Sign the admin out and return them to the console login screen. */
export async function signOutAdmin() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
