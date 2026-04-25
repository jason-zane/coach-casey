import { createClient, createAdminClient } from "@/lib/supabase/server";
import { buildFixtureActivities } from "./fixture";
import {
  fetchActivitiesSince,
  fetchActivityDetail,
  type StravaActivity,
  type StravaActivityDetail,
  type StravaLap,
} from "./client";
import { classifyActivityType } from "./activity-types";
import { runPostIngestForActivity } from "@/lib/training-load/post-ingest";

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

  const { data: upserted, error } = await admin
    .from("activities")
    .upsert(rows, { onConflict: "athlete_id,strava_id" })
    .select("id, strava_id");
  if (error) throw error;

  const idByStravaId = new Map<number, string>();
  for (const r of (upserted ?? []) as Array<{ id: string; strava_id: number }>) {
    idByStravaId.set(r.strava_id, r.id);
  }
  for (const f of fixture) {
    const activityId = idByStravaId.get(f.strava_id);
    if (!activityId) continue;
    try {
      await runPostIngestForActivity(athleteId, activityId, {
        name: f.name,
        activityType: f.activity_type,
        movingTimeS: f.moving_time_s,
        distanceM: f.distance_m,
        startDateLocal: f.start_date_local,
        stravaWorkoutType: null,
      });
    } catch (e) {
      console.warn("training_load.mock_ingest.post_ingest_failed", {
        activityId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
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
 * Pull the structured workout_type out of an activity's raw blob, when set.
 * Strava's workout_type is athlete-tagged and frequently missing, so this
 * just normalises the access pattern.
 */
export function extractWorkoutType(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const wt = (raw as { workout_type?: unknown }).workout_type;
  return typeof wt === "number" ? wt : null;
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

/**
 * Fetches the priority 8-12 week window from Strava and upserts. Pulls runs
 * AND cross-training (Ride, Swim, gym, yoga, ...) so the chat context can
 * reflect the full training picture, not just runs. Ambient types (Walk) are
 * skipped — they'd just be noise.
 *
 * Lap detail is only fetched for runs, since laps for non-running activities
 * don't carry meaningful workout structure for a marathon coach and the
 * detail endpoint counts against Strava's 100/15-min read limit.
 */
export async function ingestLiveActivitiesForAthlete(
  athleteId: string,
  weeks = 12,
) {
  const afterSeconds = Math.floor(Date.now() / 1000) - weeks * 7 * 24 * 60 * 60;
  const activities = await fetchActivitiesSince(athleteId, afterSeconds);
  const kept = activities.filter((a) => {
    const cls = classifyActivityType(a.sport_type ?? a.type);
    return cls === "run" || cls === "cross_training" || cls === "catch_all";
  });
  if (kept.length === 0) return 0;

  const runs = kept.filter(
    (a) => classifyActivityType(a.sport_type ?? a.type) === "run",
  );
  const nonRuns = kept.filter(
    (a) => classifyActivityType(a.sport_type ?? a.type) !== "run",
  );

  // Pull detail (including laps) for runs only, with bounded concurrency.
  // Degrade gracefully per activity if any single detail call fails.
  const runDetails = await mapWithConcurrency<StravaActivity, StravaActivityDetail>(
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
  const runRows = runDetails.map((d) =>
    mapStravaActivity(d, athleteId, d.laps ?? null),
  );
  const nonRunRows = nonRuns.map((a) => mapStravaActivity(a, athleteId, null));
  const rows = [...runRows, ...nonRunRows];
  const { data: upserted, error } = await admin
    .from("activities")
    .upsert(rows, { onConflict: "athlete_id,strava_id" })
    .select("id, strava_id");
  if (error) throw error;

  // Run training-load post-ingest for each activity. This includes race
  // detection + snapshot append (with recalc on threshold change) + the
  // per-activity load. We do it after the bulk upsert to keep DB writes
  // batched, then iterate sequentially to keep memory bounded — the
  // race-snapshot path needs to see the previous snapshot when present
  // and shouldn't race with itself.
  const idByStravaId = new Map<number, string>();
  for (const r of (upserted ?? []) as Array<{ id: string; strava_id: number }>) {
    idByStravaId.set(r.strava_id, r.id);
  }
  for (const source of [...runDetails, ...nonRuns]) {
    const activityId = idByStravaId.get(source.id);
    if (!activityId) continue;
    try {
      await runPostIngestForActivity(athleteId, activityId, {
        name: source.name ?? null,
        activityType: source.sport_type ?? source.type ?? null,
        movingTimeS: source.moving_time,
        distanceM: source.distance,
        startDateLocal: source.start_date_local,
        stravaWorkoutType:
          (source as { workout_type?: number | null }).workout_type ?? null,
      });
    } catch (e) {
      console.warn("training_load.live_ingest.post_ingest_failed", {
        activityId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return rows.length;
}

/**
 * Loads recent runs only. Cross-training is intentionally excluded — the two
 * existing callers (validation onboarding observations, anything legacy)
 * treat every row as a run for weekly volume / pace summaries. Cross-training
 * is fetched separately by the chat context builder.
 */
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
  const rows = data ?? [];
  return rows.filter(
    (r) => classifyActivityType(r.activity_type as string | null) === "run",
  );
}
