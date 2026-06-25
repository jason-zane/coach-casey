import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/security/redirects";

/**
 * Single auth landing for every email/OAuth flow:
 *   - `code`        → OAuth (Google) and PKCE code exchange (password signup
 *                     confirmation).
 *   - `token_hash`  → magic-link / OTP verification (admin sign-in). Verified
 *                     server-side, so it works even cross-device.
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

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const failPath = next.startsWith("/admin") ? "/admin/login" : "/signin";
  return NextResponse.redirect(`${origin}${failPath}?error=auth_failed`);
}
