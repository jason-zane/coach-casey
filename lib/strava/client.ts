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
    // Coach Casey is read-only against Strava. Debriefs and notes stay inside
    // the app rather than being written back to public activity descriptions.
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
  athlete?: StravaAthleteProfile;
  scope?: string;
};

/**
 * Subset of Strava's `DetailedAthlete` we care about. Returned in the OAuth
 * token exchange and from `GET /api/v3/athlete`. Strava does NOT expose date
 * of birth via the API; that field is captured separately in onboarding.
 */
export type StravaAthleteProfile = {
  id: number;
  firstname?: string | null;
  lastname?: string | null;
  /** 'M' | 'F' | 'X' | null. Athlete-set in Strava profile. */
  sex?: "M" | "F" | "X" | null;
  /** Bodyweight in kg. Athlete-set; often null or stale. */
  weight?: number | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

/**
 * Fetch the authenticated athlete's profile. Requires `profile:read_all`
 * scope; returns null and logs if Strava 401s (athletes connected before
 * the scope was added). Other errors throw, callers can decide whether
 * to swallow or propagate.
 */
export async function fetchAthleteProfile(
  athleteId: string,
): Promise<StravaAthleteProfile | null> {
  const token = await getValidAccessToken(athleteId);
  const res = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava /athlete failed: ${res.status} ${body}`);
  }
  return (await res.json()) as StravaAthleteProfile;
}

/**
 * Same as `fetchAthleteProfile` but with a raw access token, for the OAuth
 * callback path where the connection row hasn't been created yet (so
 * `getValidAccessToken` would 404 looking it up).
 */
export async function fetchAthleteProfileWithToken(
  accessToken: string,
): Promise<StravaAthleteProfile | null> {
  const res = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava /athlete failed: ${res.status} ${body}`);
  }
  return (await res.json()) as StravaAthleteProfile;
}

/**
 * Retrying wrapper for `fetchAthleteProfileWithToken`. Used by the OAuth
 * callback where a single failed /athlete fetch leaves the connection with
 * `strava_athlete_id = null` and silently breaks all webhook lookups for
 * the athlete (verified 2026-05-14 — onboarding ran during a Strava 429
 * window and shipped a permanently broken connection).
 *
 * Retry policy: linear backoff at 500ms, 1500ms. We stop on:
 *  - 401 (token issue, retry won't help)
 *  - 429 (Strava's 15-min window means waiting seconds doesn't recover;
 *    the in-app ingest pass retries on its next call and self-heals there)
 * Anything else (5xx, network) gets the full retry budget.
 */
export async function fetchAthleteProfileWithTokenRetrying(
  accessToken: string,
  attempts = 3,
): Promise<StravaAthleteProfile | null> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 500 * (2 * i - 1)));
    }
    try {
      return await fetchAthleteProfileWithToken(accessToken);
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : "";
      if (/ 429 /.test(msg) || /Rate Limit Exceeded/i.test(msg)) {
        // 429 won't recover within our retry window. Bail and let the
        // ingest self-heal path try again later with a fresh budget.
        throw e;
      }
    }
  }
  throw lastErr;
}

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
  start_date: string; // UTC ISO
  start_date_local: string;
  timezone?: string | null;
  utc_offset?: number | null;
  location_city?: string | null;
  description?: string | null;
  distance: number; // m
  moving_time: number; // s
  elapsed_time?: number; // s
  average_speed: number; // m/s
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  device_watts?: boolean;
  average_cadence?: number;
  suffer_score?: number;
  average_temp?: number;
  total_elevation_gain?: number;
  elev_high?: number;
  elev_low?: number;
  manual?: boolean;
  trainer?: boolean;
  commute?: boolean;
  /** 0=default, 1=race, 2=long run, 3=workout. Athlete-set, often missing. */
  workout_type?: number | null;
};

export async function fetchActivitiesSince(
  athleteId: string,
  afterIsoOrSeconds: number,
): Promise<StravaActivity[]> {
  return fetchActivitiesWindow(athleteId, {
    afterSeconds: afterIsoOrSeconds,
  });
}

/**
 * Paginate Strava's /athlete/activities with optional after/before bounds.
 * Both bounds are inclusive seconds-since-epoch. `before` is used by the
 * long-history backfill to avoid overlapping the recent foreground ingest
 * window, keeps the backfill cleanly disjoint so it never overwrites lap
 * detail we already pulled.
 *
 * Safety caps at 30 pages × 100 = 3000 activities per call. Two years of
 * a heavy training load (~520 activities) is well under that. Larger
 * histories (all-time) require multiple invocations across cron passes.
 */
export async function fetchActivitiesWindow(
  athleteId: string,
  bounds: { afterSeconds?: number; beforeSeconds?: number; maxPages?: number },
): Promise<StravaActivity[]> {
  const token = await getValidAccessToken(athleteId);
  const all: StravaActivity[] = [];
  let page = 1;
  const maxPages = bounds.maxPages ?? 30;
  while (true) {
    const params = new URLSearchParams({ per_page: "100", page: String(page) });
    if (bounds.afterSeconds != null) {
      params.set("after", String(bounds.afterSeconds));
    }
    if (bounds.beforeSeconds != null) {
      params.set("before", String(bounds.beforeSeconds));
    }
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
    if (page > maxPages) break;
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

export type StravaSplit = {
  distance: number;
  moving_time: number;
  elapsed_time?: number;
  elevation_difference?: number;
  average_speed?: number;
  average_heartrate?: number;
  pace_zone?: number;
  split: number;
};

export type StravaBestEffort = {
  name: string;
  distance: number;
  elapsed_time: number;
  moving_time?: number;
  start_date_local: string;
  pr_rank?: number | null;
  achievements?: unknown[];
};

export type StravaSegmentEffort = {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  start_date_local: string;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  device_watts?: boolean;
  pr_rank?: number | null;
  kom_rank?: number | null;
  achievements?: unknown[];
  segment?: {
    id: number;
    name: string;
    activity_type?: string;
    distance?: number;
    average_grade?: number;
    max_grade?: number;
    elevation_high?: number;
    elevation_low?: number;
    climb_category?: number;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  };
};

export type StravaActivityDetail = StravaActivity & {
  laps?: StravaLap[];
  splits_metric?: StravaSplit[];
  splits_standard?: StravaSplit[];
  best_efforts?: StravaBestEffort[];
  segment_efforts?: StravaSegmentEffort[];
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
  // include_all_efforts=true so segment_efforts come through. The response
  // gets bigger (segment lists can be large on long rides) but it's the same
  // single API read either way, and segment_efforts feed Casey's tool layer.
  const res = await fetch(
    `${STRAVA_API_BASE}/activities/${activityId}?include_all_efforts=true`,
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
