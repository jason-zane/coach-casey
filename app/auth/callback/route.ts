import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { enforceSignupGate } from "@/lib/auth/signup-gate";
import { safeNextPath } from "@/lib/security/redirects";
import { captureError } from "@/lib/observability/capture";
import { notifyFounder } from "@/lib/notify";
import { pushAdmins } from "@/lib/admin/notify-admins";

/**
 * Single auth landing for every email/OAuth flow:
 *   - `code`        → OAuth (Google) and PKCE code exchange. Browser-bound:
 *                     requires the code_verifier cookie set when the link was
 *                     requested, so it fails if opened in a different browser.
 *   - `token_hash`  → magic-link / OTP verification. Verified server-side, so
 *                     it works even cross-device (e.g. link tapped in the Gmail
 *                     app). Magic-link/signup emails should use this path — see
 *                     supabase/templates/magic-link.html.
 * `next` is validated to an internal path; on failure we send the visitor back
 * to whichever sign-in surface they came from (admin vs the main app).
 *
 * Both paths run the invite gate (lib/auth/signup-gate.ts) after the session
 * is established: accounts minted around the invite check — Google OAuth, or
 * GoTrue's self-serve endpoints called directly with the public anon key —
 * are deleted and refused unless signups are open or the visitor carried a
 * valid invite through the round-trip (see signUpWithGoogle).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createClient();

  let failure: string | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      if ((await enforceSignupGate(supabase, data.user)) === "refused") {
        return NextResponse.redirect(`${origin}/signin?error=invite_required`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    failure = `exchangeCodeForSession: ${error?.message ?? "no user in exchange result"}`;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error && data.user) {
      if ((await enforceSignupGate(supabase, data.user)) === "refused") {
        return NextResponse.redirect(`${origin}/signin?error=invite_required`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    failure = `verifyOtp: ${error?.message ?? "no user in verify result"}`;
  } else {
    failure = "no code or token_hash on callback";
  }

  const err = new Error(`auth callback failed — ${failure}`);
  err.name = "AuthCallbackError";
  await captureError(err, {
    source: "route",
    route: "/auth/callback",
    context: {
      flow: code ? "code" : tokenHash ? "token_hash" : "none",
      type: type ?? null,
      next,
    },
  });

  if (code || (tokenHash && type)) {
    await Promise.all([
      notifyFounder({
        subject: "⚠️ Coach Casey sign-in failed",
        text: [
          "A sign-in / sign-up link failed to verify at /auth/callback.",
          "",
          `Reason: ${failure}`,
          `Flow:   ${code ? "code (PKCE — browser-bound)" : "token_hash"}`,
          `Type:   ${type ?? "—"}`,
          `Next:   ${next}`,
          "",
          "If this is widespread, confirm the hosted magic-link email template still uses token_hash (supabase/templates/magic-link.html).",
        ].join("\n"),
      }),
      pushAdmins({
        title: "Sign-in failed",
        body: `${code ? "code" : "token_hash"} flow — ${failure}`.slice(0, 140),
        tag: "auth-failed",
        url: "/admin",
      }),
    ]);
  }

  const failPath = next.startsWith("/admin") ? "/admin/login" : "/signin";
  return NextResponse.redirect(`${origin}${failPath}?error=auth_failed`);
}
