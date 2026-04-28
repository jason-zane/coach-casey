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
    // `activity:write` is required to append Casey's verdict line to the
    // athlete's activity description after each debrief. Existing connections
    // predating this scope keep working for read; the description-write path
    // no-ops until the athlete reconnects with the broader scope.
    scope: "read,activity:read_all,activity:write,profile:read_all",
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

export type UpdateActivityDescriptionResult =
  | { kind: "ok" }
  | { kind: "skip"; reason: "mock_connection" | "no_connection" | "missing_scope" }
  | { kind: "error"; status: number | null; message: string };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strip a previously-appended Casey block from the tail of a description.
 *
 * The block we write is `${verdict}\n\n${signature}`, joined to any prior
 * description with `\n\n`. To handle force-regen cleanly we remove the
 * prior block before computing the next description, so re-runs replace
 * rather than stack.
 *
 * Match shape, anchored to end of string:
 *   (^|\n\n) [non-newline verdict] \n\n SIGNATURE \s*$
 *
 * If the user added content *after* the signature (manual edit), the
 * regex won't match and we leave the description alone, they wanted
 * that content there.
 */
export function stripPriorCaseyBlock(
  description: string,
  signature: string,
): string {
  const re = new RegExp(
    `(?:\\n\\n|^)[^\\n]+\\n\\n${escapeRegex(signature)}\\s*$`,
  );
  return description.replace(re, "").replace(/\s+$/, "");
}

/**
 * Append-safe Strava activity description update.
 *
 * Reads the current description, strips any previously-appended Casey
 * block (so force-regen replaces rather than stacks), and PUTs the
 * combined text. No-ops when the description already exactly matches
 * what we'd write, so webhook retries and equivalent regenerations
 * don't churn Strava.
 *
 * Failures are returned, not thrown, so the caller can fire-and-forget
 * this from the debrief commit path without risking the debrief itself.
 *
 * Athletes connected before `activity:write` was added to our OAuth
 * scope will see a 401 from Strava; we map that to `missing_scope` and
 * skip silently. They'll get the description appended once they
 * reconnect.
 */
export async function updateActivityDescriptionAppend(
  athleteId: string,
  stravaActivityId: number,
  appended: string,
  signature: string,
): Promise<UpdateActivityDescriptionResult> {
  let token: string;
  try {
    token = await getValidAccessToken(athleteId);
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.includes("Mock connection")) return { kind: "skip", reason: "mock_connection" };
    if (msg.includes("No Strava connection")) return { kind: "skip", reason: "no_connection" };
    return { kind: "error", status: null, message: msg };
  }

  // Read current description so we append rather than replace whatever the
  // athlete (or another tool) wrote there.
  const getRes = await fetch(
    `${STRAVA_API_BASE}/activities/${stravaActivityId}?include_all_efforts=false`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!getRes.ok) {
    if (getRes.status === 401) return { kind: "skip", reason: "missing_scope" };
    return {
      kind: "error",
      status: getRes.status,
      message: `Strava get-for-update ${stravaActivityId} failed`,
    };
  }
  const current = (await getRes.json()) as { description?: string | null };
  const existing = current.description ?? "";

  // Strip any previously-appended Casey block so force-regen / re-writes
  // replace rather than stack. The user's own text (anything outside our
  // block) is preserved.
  const userText = stripPriorCaseyBlock(existing, signature);
  const next = userText.length > 0 ? `${userText}\n\n${appended}` : appended;

  // Idempotency: if the description is already exactly what we'd write,
  // skip the PUT. Catches webhook retries and re-runs that produce the
  // same verdict.
  if (existing === next) return { kind: "ok" };

  const putRes = await fetch(
    `${STRAVA_API_BASE}/activities/${stravaActivityId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ description: next }),
      cache: "no-store",
    },
  );
  if (!putRes.ok) {
    if (putRes.status === 401) return { kind: "skip", reason: "missing_scope" };
    const body = await putRes.text();
    return {
      kind: "error",
      status: putRes.status,
      message: `Strava PUT ${stravaActivityId} failed: ${body}`,
    };
  }
  return { kind: "ok" };
}
