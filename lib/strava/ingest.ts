import { createClient, createAdminClient } from "@/lib/supabase/server";
import { buildFixtureActivities } from "./fixture";
import {
  fetchActivitiesSince,
  fetchActivityDetail,
  fetchAthleteProfile,
  type StravaActivity,
  type StravaActivityDetail,
  type StravaLap,
} from "./client";
import { classifyActivityType } from "./activity-types";

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
  // Backfill demographics from Strava on every ingest pass when our row is
  // still empty. This catches athletes connected before we started seeding
  // sex/weight in the OAuth callback. Once populated, the if-null guard
  // below short-circuits and never overwrites the athlete's edits.
  await maybeBackfillDemographicsFromStrava(athleteId);

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
  const { error } = await admin
    .from("activities")
    .upsert(rows, { onConflict: "athlete_id,strava_id" });
  if (error) throw error;
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

/**
 * Lazy backfill: pull sex + weight from Strava when the athlete row has
 * neither yet. No-op once at least one of them is set, so this only fires
 * on the first ingest after deploy for already-connected athletes.
 *
 * Failures are swallowed: ingest must keep working even if the profile
 * endpoint is rate-limited or the connection is missing the
 * `profile:read_all` scope.
 */
async function maybeBackfillDemographicsFromStrava(
  athleteId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: athlete } = await admin
    .from("athletes")
    .select("sex, weight_kg")
    .eq("id", athleteId)
    .maybeSingle();
  if (!athlete) return;
  const a = athlete as { sex: string | null; weight_kg: number | null };
  if (a.sex && a.weight_kg != null) return;

  try {
    const profile = await fetchAthleteProfile(athleteId);
    if (!profile) return;
    const update: Record<string, unknown> = {};
    if (
      !a.sex &&
      (profile.sex === "M" || profile.sex === "F" || profile.sex === "X")
    ) {
      update.sex = profile.sex;
    }
    if (
      a.weight_kg == null &&
      typeof profile.weight === "number" &&
      profile.weight > 20 &&
      profile.weight < 250
    ) {
      update.weight_kg = profile.weight;
    }
    if (Object.keys(update).length > 0) {
      await admin.from("athletes").update(update).eq("id", athleteId);
    }
  } catch (e) {
    console.warn("Strava demographic backfill failed (non-fatal)", e);
  }
}
