import { createAdminClient } from "@/lib/supabase/server";

const STRAVA_AUTH_BASE = "https://www.strava.com/oauth";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

export function isLiveMode(): boolean {
  return (
    process.env.STRAVA_MODE === "live" &&
    Boolean(process.env.STRAVA_CLIENT_ID) &&
    Boolean(process.env.STRAVA_CLIENT_SECRET)
  );
}

export function isDevMode(): boolean {
  // Single-user bootstrap from Strava's "My API Application" page. Skips OAuth
  // entirely, so no callback domain config needed. Great for solo testing.
  return (
    process.env.STRAVA_MODE === "dev" &&
    Boolean(process.env.STRAVA_DEV_ACCESS_TOKEN) &&
    Boolean(process.env.STRAVA_DEV_REFRESH_TOKEN)
  );
}

export function stravaAuthorizeUrl(state: string): string {
  const redirect = `${process.env.NEXT_PUBLIC_APP_URL}/api/strava/callback`;
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: redirect,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all,profile:read_all",
    state,
  });
  return `${STRAVA_AUTH_BASE}/authorize?${params.toString()}`;
}

type TokenResponse = {
  token_type: "Bearer";
  access_token: string;
  refresh_token: string;
  expires_at: number; // seconds since epoch
  expires_in: number;
  athlete?: { id: number };
  scope?: string;
};

export async function exchangeCodeForToken(
  code: string,
): Promise<TokenResponse> {
  const res = await fetch(`${STRAVA_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava token exchange failed: ${res.status} ${body}`);
  }
  return res.json();
}

export async function refreshToken(
  refresh_token: string,
): Promise<TokenResponse> {
  const res = await fetch(`${STRAVA_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava token refresh failed: ${res.status} ${body}`);
  }
  return res.json();
}

export async function getValidAccessToken(athleteId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: conn, error } = await admin
    .from("strava_connections")
    .select(
      "access_token, refresh_token, expires_at, is_mock",
    )
    .eq("athlete_id", athleteId)
    .maybeSingle();
  if (error) throw error;
  if (!conn) throw new Error("No Strava connection for athlete");
  if (conn.is_mock) throw new Error("Mock connection; no live token");
  if (!conn.access_token || !conn.refresh_token) {
    throw new Error("Strava tokens missing");
  }

  const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  const nowMs = Date.now();
  if (expiresAt - nowMs > 60_000) {
    return conn.access_token;
  }

  const refreshed = await refreshToken(conn.refresh_token);
  await admin
    .from("strava_connections")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
    })
    .eq("athlete_id", athleteId);
  return refreshed.access_token;
}

export type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date_local: string;
  distance: number; // m
  moving_time: number; // s
  average_speed: number; // m/s
  average_heartrate?: number;
  max_heartrate?: number;
  total_elevation_gain?: number;
  /** 0=default, 1=race, 2=long run, 3=workout. Athlete-set, often missing. */
  workout_type?: number | null;
};

export async function fetchActivitiesSince(
  athleteId: string,
  afterIsoOrSeconds: number,
): Promise<StravaActivity[]> {
  const token = await getValidAccessToken(athleteId);
  const all: StravaActivity[] = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({
      after: String(afterIsoOrSeconds),
      per_page: "100",
      page: String(page),
    });
    const res = await fetch(
      `${STRAVA_API_BASE}/athlete/activities?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Strava list activities failed: ${res.status} ${body}`);
    }
    const batch = (await res.json()) as StravaActivity[];
    all.push(...batch);
    if (batch.length < 100) break;
    page += 1;
    if (page > 20) break; // safety
  }
  return all;
}

export type StravaLap = {
  id: number;
  lap_index: number;
  name: string | null;
  distance: number; // m
  moving_time: number; // s
  elapsed_time: number;
  average_speed: number; // m/s
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  total_elevation_gain?: number;
  start_date_local: string;
};

export type StravaActivityDetail = StravaActivity & {
  laps?: StravaLap[];
  workout_type?: number;
  device_name?: string;
};

/**
 * Fetches the detail endpoint for a single activity, which includes lap-level
 * data. Used during ingest so workouts (interval reps, tempo splits) are
 * legible rather than showing as a single-pace summary.
 */
export async function fetchActivityDetail(
  athleteId: string,
  activityId: number,
): Promise<StravaActivityDetail> {
  const token = await getValidAccessToken(athleteId);
  const res = await fetch(
    `${STRAVA_API_BASE}/activities/${activityId}?include_all_efforts=false`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Strava activity detail ${activityId} failed: ${res.status} ${body}`,
    );
  }
  return res.json();
}

export type StravaStream = {
  type: string;
  data: number[];
  series_type?: string;
  original_size?: number;
  resolution?: string;
};

/**
 * Fetch activity streams keyed by type. Used to compute average grade-
 * adjusted pace for runs per `docs/training-load-feature-spec.md` §4.1.
 * Each call counts against Strava's 100-reads-per-15-min budget; the
 * caller is expected to gate by feature flag and bound concurrency.
 */
export async function fetchActivityStreams(
  athleteId: string,
  activityId: number,
  keys: string[],
): Promise<Record<string, StravaStream>> {
  const token = await getValidAccessToken(athleteId);
  const params = new URLSearchParams({
    keys: keys.join(","),
    key_by_type: "true",
  });
  const res = await fetch(
    `${STRAVA_API_BASE}/activities/${activityId}/streams?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Strava streams ${activityId} failed: ${res.status} ${body}`,
    );
  }
  return res.json();
}

/**
 * Compute the average GAP from a `grade_adjusted_distance` stream. The
 * stream is cumulative — the final value is the total grade-adjusted
 * distance in metres. Combined with moving time, that's average GAP.
 */
export function averageGapSecPerKm(
  streams: Record<string, StravaStream>,
  movingTimeS: number,
): number | null {
  if (!movingTimeS || movingTimeS <= 0) return null;
  const stream = streams.grade_adjusted_distance;
  if (!stream || !Array.isArray(stream.data) || stream.data.length === 0) {
    return null;
  }
  const totalMeters = stream.data[stream.data.length - 1];
  if (!Number.isFinite(totalMeters) || totalMeters <= 0) return null;
  return Math.round(movingTimeS / (totalMeters / 1000));
}
