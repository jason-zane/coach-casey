import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/log";
import {
  exchangeCodeForToken,
  fetchAthleteProfileWithToken,
  fetchAthleteProfileWithTokenRetrying,
  isLiveMode,
} from "@/lib/strava/client";
import { claimStravaAthleteId } from "@/lib/strava/connections";

const STRAVA_STATE_COOKIE = "strava_oauth_state";

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const scope = searchParams.get("scope") ?? "";
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STRAVA_STATE_COOKIE)?.value ?? null;

  if (error || !code) {
    return redirectClearingState(
      `${appUrl}/onboarding/strava?error=${encodeURIComponent(error ?? "no_code")}`,
    );
  }

  if (!isLiveMode()) {
    return redirectClearingState(
      `${appUrl}/onboarding/strava?error=not_live`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectClearingState(`${appUrl}/signin`);
  }

  if (!state || !expectedState || state !== expectedState) {
    return redirectClearingState(
      `${appUrl}/onboarding/strava?error=state_mismatch`,
    );
  }

  // Minimum required scope: activity:read_all is needed to read the athlete's
  // private training data. Bail if the athlete de-selected it.
  if (!scope.includes("activity:read_all")) {
    return redirectClearingState(
      `${appUrl}/onboarding/strava?error=missing_scope`,
    );
  }

  const admin = createAdminClient();
  const { data: athlete } = await admin
    .from("athletes")
    .select("id, onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; onboarding_completed_at: string | null }>();
  if (!athlete) {
    return redirectClearingState(`${appUrl}/signin`);
  }

  try {
    const token = await exchangeCodeForToken(code);

    // Resolve strava_athlete_id eagerly. Strava's token response is supposed
    // to include the athlete object, but in practice it's sometimes missing
    // the id, which leaves the connection row with NULL strava_athlete_id
    // and silently breaks the webhook (the handler looks up athletes by it).
    // Fall back to /athlete to guarantee we have it before writing the row.
    // The retrying variant absorbs transient 5xx / network blips; on a
    // total miss the ingest pass that runs immediately after this callback
    // re-tries the profile fetch and self-heals the connection (see
    // `maybeHealConnectionAndDemographics` in lib/strava/ingest.ts).
    let stravaAthleteId: number | null = token.athlete?.id ?? null;
    let profileFromFallback: Awaited<
      ReturnType<typeof fetchAthleteProfileWithToken>
    > = null;
    if (stravaAthleteId == null) {
      try {
        profileFromFallback = await fetchAthleteProfileWithTokenRetrying(
          token.access_token,
        );
        stravaAthleteId = profileFromFallback?.id ?? null;
      } catch (e) {
        // Loud log so the broken-webhook state is visible. Self-heal runs
        // on the next ingest pass; we don't block onboarding on this.
        console.error(
          "[strava-callback] /athlete fallback exhausted retries; connection landing with NULL strava_athlete_id, ingest will self-heal",
          { athleteId: athlete.id, error: e instanceof Error ? e.message : e },
        );
      }
    }

    // One Strava account backs at most one app account. If a different
    // athlete row already holds this strava_athlete_id (same human under a
    // fresh sign-in, a recreated account), the newest grant wins and the
    // older connection is deleted, mirroring Strava's deauth webhook. The
    // partial unique index on strava_connections.strava_athlete_id
    // backstops the race between two concurrent callbacks.
    await claimStravaAthleteId(admin, {
      athleteId: athlete.id,
      stravaAthleteId,
    });

    const { error: connectionError } = await admin
      .from("strava_connections")
      .upsert(
        {
          athlete_id: athlete.id,
          strava_athlete_id: stravaAthleteId,
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          expires_at: new Date(token.expires_at * 1000).toISOString(),
          scope: scope,
          is_mock: false,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "athlete_id" },
      );
    // A connection row that silently failed to write strands the athlete on
    // the reading page with nothing to ingest; fail loud into the
    // exchange_failed redirect instead.
    if (connectionError) throw connectionError;

    await recordAuditEvent({
      actorType: "athlete",
      actorId: athlete.id,
      action: "strava.connect",
      targetAthleteId: athlete.id,
      metadata: { stravaAthleteId },
    });

    // Pull sex + weight from Strava profile and seed the athlete row. The
    // token response sometimes includes the athlete object inline, but it's
    // not guaranteed across all Strava client versions, so do an explicit
    // /athlete fetch. Failures here are non-fatal: we'd rather complete
    // onboarding and pick up the data later (ingest backfill or the
    // about-you step) than block the connect flow.
    try {
      const profile =
        profileFromFallback ??
        (token.athlete && (token.athlete.sex || token.athlete.weight != null)
          ? token.athlete
          : await fetchAthleteProfileWithToken(token.access_token));

      if (profile) {
        const update: Record<string, unknown> = {};
        // Only seed when our row is currently empty, never overwrite
        // values the athlete may edit later in the about-you step.
        const { data: current } = await admin
          .from("athletes")
          .select("display_name, sex, weight_kg")
          .eq("id", athlete.id)
          .maybeSingle();
        if (!current?.display_name && profile.firstname) {
          const trimmed = profile.firstname.trim();
          if (trimmed.length > 0) update.display_name = trimmed;
        }
        if (
          !current?.sex &&
          (profile.sex === "M" || profile.sex === "F" || profile.sex === "X")
        ) {
          update.sex = profile.sex;
        }
        if (
          current?.weight_kg == null &&
          typeof profile.weight === "number" &&
          profile.weight > 20 &&
          profile.weight < 250
        ) {
          update.weight_kg = profile.weight;
        }
        if (Object.keys(update).length > 0) {
          await admin.from("athletes").update(update).eq("id", athlete.id);
        }
      }
    } catch (e) {
      console.warn("Strava /athlete profile seed failed (non-fatal)", e);
    }

    // Initial connect: don't run ingest inline, let the reading-state page
    // do it behind the designed loading moment. Keeps the callback fast so
    // the browser isn't hanging on the redirect back from Strava.
    //
    // Reconnect (athlete already onboarded, e.g. granting the activity:write
    // scope the blurb feature needs): the reading page is gated to
    // onboarding by the middleware, which would bounce /onboarding/reading
    // to /app. Send them straight back to settings instead, where the
    // verdicts toggle lives. History already exists, so no inline ingest is
    // needed; the webhook and poll pick up anything new.
    const destination = athlete.onboarding_completed_at
      ? `${appUrl}/app/settings`
      : `${appUrl}/onboarding/reading`;
    return redirectClearingState(destination);
  } catch (e) {
    console.error("Strava callback failed", e);
    return redirectClearingState(
      `${appUrl}/onboarding/strava?error=exchange_failed`,
    );
  }
}

function redirectClearingState(url: string): NextResponse {
  const response = NextResponse.redirect(url);
  response.cookies.set(STRAVA_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/strava",
    maxAge: 0,
  });
  return response;
}
