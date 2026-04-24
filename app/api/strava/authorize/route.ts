import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isLiveMode, stravaAuthorizeUrl } from "@/lib/strava/client";

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

  // Use the auth user id as state; we verify it in the callback by comparing
  // against the currently authed user.
  const state = user.id;
  return NextResponse.redirect(stravaAuthorizeUrl(state));
}
