import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { exchangeCodeForToken, isLiveMode } from "@/lib/strava/client";

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const scope = searchParams.get("scope") ?? "";

  if (error || !code) {
    return NextResponse.redirect(
      `${appUrl}/onboarding/strava?error=${encodeURIComponent(error ?? "no_code")}`,
    );
  }

  if (!isLiveMode()) {
    return NextResponse.redirect(
      `${appUrl}/onboarding/strava?error=not_live`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (state && state !== user.id)) {
    return NextResponse.redirect(`${appUrl}/signin`);
  }

  // Minimum required scope: activity:read_all is needed to read the athlete's
  // private training data. Bail if the athlete de-selected it.
  if (!scope.includes("activity:read_all")) {
    return NextResponse.redirect(
      `${appUrl}/onboarding/strava?error=missing_scope`,
    );
  }

  const admin = createAdminClient();
  const { data: athlete } = await admin
    .from("athletes")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete) {
    return NextResponse.redirect(`${appUrl}/signin`);
  }

  try {
    const token = await exchangeCodeForToken(code);

    await admin.from("strava_connections").upsert(
      {
        athlete_id: athlete.id,
        strava_athlete_id: token.athlete?.id ?? null,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: new Date(token.expires_at * 1000).toISOString(),
        scope: scope,
        is_mock: false,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "athlete_id" },
    );

    // Don't run ingest inline — let the reading-state page do it behind
    // the designed loading moment. Keeps the callback fast so the browser
    // isn't hanging on the redirect back from Strava.
    return NextResponse.redirect(`${appUrl}/onboarding/reading`);
  } catch (e) {
    console.error("Strava callback failed", e);
    return NextResponse.redirect(
      `${appUrl}/onboarding/strava?error=exchange_failed`,
    );
  }
}
