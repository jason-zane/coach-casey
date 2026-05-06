import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isLiveMode, stravaAuthorizeUrl } from "@/lib/strava/client";

const STRAVA_STATE_COOKIE = "strava_oauth_state";

export async function GET() {
  if (!isLiveMode()) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/strava?error=not_live`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/signin`,
    );
  }

  // OAuth state must be an unguessable nonce. The callback still resolves the
  // current Supabase user, then compares this one-time cookie before exchanging
  // the Strava authorization code.
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(stravaAuthorizeUrl(state));
  response.cookies.set(STRAVA_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/strava",
    maxAge: 10 * 60,
  });
  return response;
}
