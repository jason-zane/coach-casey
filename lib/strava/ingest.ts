import { createClient, createAdminClient } from "@/lib/supabase/server";
import { buildFixtureActivities } from "./fixture";
import {
  fetchActivitiesSince,
  fetchActivityDetail,
  type StravaActivity,
  type StravaActivityDetail,
  type StravaLap,
} from "./client";

export async function ingestMockActivitiesForAthlete(athleteId: string) {
  const admin = createAdminClient();
  const fixture = buildFixtureActivities();

  const rows = fixture.map((a) => ({
    athlete_id: athleteId,
    strava_id: a.strava_id,
    start_date_local: a.start_date_local,
    name: a.name,
    activity_type: a.activity_type,
    distance_m: a.distance_m,
    moving_time_s: a.moving_time_s,
    avg_pace_s_per_km: a.avg_pace_s_per_km,
    avg_hr: a.avg_hr,
    max_hr: a.max_hr,
    elevation_gain_m: a.elevation_gain_m,
    raw: { source: "mock-fixture" },
  }));

  const { error } = await admin
    .from("activities")
    .upsert(rows, { onConflict: "athlete_id,strava_id" });
  if (error) throw error;
}

function paceSPerKm(distance_m: number, moving_time_s: number): number | null {
  if (!distance_m || !moving_time_s) return null;
  const km = distance_m / 1000;
  if (km <= 0) return null;
  return Math.round(moving_time_s / km);
}

function mapStravaActivity(
  a: StravaActivity,
  athleteId: string,
  laps: StravaLap[] | null = null,
) {
  return {
    athlete_id: athleteId,
    strava_id: a.id,
    start_date_local: a.start_date_local,
    name: a.name,
    activity_type: a.sport_type ?? a.type,
    distance_m: a.distance,
    moving_time_s: a.moving_time,
    avg_pace_s_per_km: paceSPerKm(a.distance, a.moving_time),
    avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    max_hr: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    elevation_gain_m: a.total_elevation_gain ?? null,
    raw: a as unknown as Record<string, unknown>,
    laps,
  };
}

/**
 * Fetch detail (with laps) for each activity, with bounded concurrency so we
 * stay well inside Strava's 100-reads-per-15-minutes rate limit without
 * serialising the whole pull.
 */
async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return out;
}

/** Fetches the priority 8-12 week window from Strava and upserts. */
export async function ingestLiveActivitiesForAthlete(
  athleteId: string,
  weeks = 12,
) {
  const afterSeconds = Math.floor(Date.now() / 1000) - weeks * 7 * 24 * 60 * 60;
  const activities = await fetchActivitiesSince(athleteId, afterSeconds);
  const runs = activities.filter((a) => {
    const t = (a.sport_type ?? a.type ?? "").toLowerCase();
    return t.includes("run");
  });
  if (runs.length === 0) return 0;

  // Pull detail (including laps) in parallel, degrade gracefully per activity
  // if any single detail call fails.
  const details = await mapWithConcurrency<StravaActivity, StravaActivityDetail>(
    runs,
    5,
    async (a) => {
      try {
        return await fetchActivityDetail(athleteId, a.id);
      } catch (e) {
        console.warn("activity detail fetch failed", a.id, e);
        return a as StravaActivityDetail;
      }
    },
  );

  const admin = createAdminClient();
  const rows = details.map((d) =>
    mapStravaActivity(d, athleteId, d.laps ?? null),
  );
  const { error } = await admin
    .from("activities")
    .upsert(rows, { onConflict: "athlete_id,strava_id" });
  if (error) throw error;
  return rows.length;
}

export async function loadRecentActivities(athleteId: string, weeks = 12) {
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - weeks * 7);

  const { data, error } = await supabase
    .from("activities")
    .select(
      "start_date_local, name, activity_type, distance_m, moving_time_s, avg_pace_s_per_km, avg_hr, max_hr, elevation_gain_m, laps",
    )
    .eq("athlete_id", athleteId)
    .gte("start_date_local", since.toISOString())
    .order("start_date_local", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
