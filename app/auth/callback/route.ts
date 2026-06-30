import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
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
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    failure = `exchangeCodeForSession: ${error.message}`;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    failure = `verifyOtp: ${error.message}`;
  } else {
    failure = "no code or token_hash on callback";
  }

  // Auth-callback failures were previously invisible (silent redirect to
  // ?error=auth_failed). Capture them so a broken sign-in shows up in the
  // observability dashboard. Best-effort and never throws.
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

  // A failed *verification* (vs a bot hitting the bare callback) means a real
  // sign-in/sign-up funnel is broken — alert admins so it's never silently
  // swallowed again. Both channels are best-effort and never throw.
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
        url: "/app/admin",
      }),
    ]);
  }

  const failPath = next.startsWith("/admin") ? "/admin/login" : "/signin";
  return NextResponse.redirect(`${origin}${failPath}?error=auth_failed`);
}
