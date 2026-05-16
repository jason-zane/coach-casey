import { createClient, createAdminClient } from "@/lib/supabase/server";
import { buildFixtureActivities } from "./fixture";
import {
  fetchActivitiesSince,
  fetchActivityDetail,
  fetchAthleteProfile,
  type StravaActivity,
  type StravaActivityDetail,
  type StravaLap,
  type StravaSplit,
  type StravaBestEffort,
} from "./client";
import { classifyActivityType, isRunType } from "./activity-types";
import { isRateLimited } from "./rate-limit";

/**
 * Persistence mode for `mapStravaActivity`.
 *
 *   summary, from the list endpoint, no per-activity detail. Used by the
 *            long-history backfill where we trade detail for read budget.
 *   detail,  from /activities/:id during the foreground 12-week ingest. Laps
 *            and splits are stored; best_efforts is NOT (it's "more data than
 *            we routinely need").
 *   deep,    from /activities/:id on an explicit deeper fetch, the on-demand
 *            refresh tool or the paywall deep-backfill. Best_efforts is
 *            stored in addition to laps and splits.
 *
 * Segment_efforts is never persisted; the column is kept for back-compat with
 * historical rows but new writes always set it to null.
 */
export type IngestMode = "summary" | "detail" | "deep";

/**
 * Whitelist of top-level fields kept inside the `raw` JSONB blob. Everything
 * not in this set is dropped at ingest time, which is where most of the per-
 * activity storage waste lived (polylines, social counts, photos, sharing
 * preferences, Strava plumbing). The structured columns above carry the
 * fields Casey actually reads day-to-day.
 *
 * Per-activity sub-objects (laps, splits_*, best_efforts, segment_efforts)
 * are stored in their own columns, so they're explicitly excluded from raw
 * to avoid duplicating large arrays.
 */
const RAW_WHITELIST: ReadonlySet<string> = new Set([
  "id",
  "name",
  "description",
  "start_date_local",
  "timezone",
  "utc_offset",
  "location_city",
  "type",
  "sport_type",
  "workout_type",
  "distance",
  "moving_time",
  "elapsed_time",
  "average_heartrate",
  "max_heartrate",
  "average_cadence",
  "average_temp",
  "total_elevation_gain",
  "elev_high",
  "elev_low",
  "manual",
  "trainer",
  "commute",
  "suffer_score",
  "gear_id",
  "device_name",
  "average_speed",
  "max_speed",
  "average_watts",
  "max_watts",
  "weighted_average_watts",
  "kilojoules",
  "device_watts",
]);

function trimRawBlob(a: StravaActivity | StravaActivityDetail): Record<string, unknown> {
  const src = a as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    if (RAW_WHITELIST.has(key)) {
      out[key] = src[key];
    }
  }
  // Keep gear.name for shoe-rotation context, drop everything else under gear.
  const gear = src.gear as { name?: string } | null | undefined;
  if (gear?.name) out.gear = { name: gear.name };
  return out;
}

const LAP_RUN_FIELDS = [
  "lap_index",
  "name",
  "distance",
  "moving_time",
  "elapsed_time",
  "total_elevation_gain",
  "average_cadence",
  "average_heartrate",
  "max_heartrate",
] as const;
const LAP_RIDE_FIELDS = [
  ...LAP_RUN_FIELDS,
  "average_speed",
  "max_speed",
  "average_watts",
  "max_watts",
] as const;

function trimLap(l: StravaLap, isRun: boolean): Record<string, unknown> {
  const src = l as unknown as Record<string, unknown>;
  const fields = isRun ? LAP_RUN_FIELDS : LAP_RIDE_FIELDS;
  const out: Record<string, unknown> = {};
  for (const k of fields) {
    if (src[k] != null) out[k] = src[k];
  }
  return out;
}

const SPLIT_FIELDS = [
  "split",
  "distance",
  "elapsed_time",
  "moving_time",
  "average_speed",
  "elevation_difference",
  "average_heartrate",
  "average_grade_adjusted_speed",
] as const;

function trimSplit(s: StravaSplit): Record<string, unknown> {
  const src = s as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of SPLIT_FIELDS) {
    if (src[k] != null) out[k] = src[k];
  }
  return out;
}

const BEST_EFFORT_FIELDS = [
  "name",
  "distance",
  "elapsed_time",
  "moving_time",
  "pr_rank",
] as const;

function trimBestEffort(e: StravaBestEffort): Record<string, unknown> {
  const src = e as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of BEST_EFFORT_FIELDS) {
    if (src[k] != null) out[k] = src[k];
  }
  return out;
}

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

/**
 * Build the persisted activity row from a Strava activity payload.
 *
 * Power and speed columns are NULL for runs (TrailRun / VirtualRun included)
 * and only populated for rides + other non-run activities. Segment_efforts is
 * never persisted on new writes; `best_efforts` is persisted only when
 * `mode === "deep"`. The `raw` JSONB is filtered through a whitelist so we
 * stop carrying polylines, social counts, photos, and Strava plumbing.
 */
export function mapStravaActivity(
  a: StravaActivity,
  athleteId: string,
  laps: StravaLap[] | null = null,
  mode: IngestMode = "summary",
) {
  const activityType = a.sport_type ?? a.type;
  const isRun = isRunType(activityType);

  const detail = a as Partial<StravaActivityDetail>;

  const trimmedLaps = laps ? laps.map((l) => trimLap(l, isRun)) : null;
  const splitsMetric = detail.splits_metric
    ? detail.splits_metric.map(trimSplit)
    : null;
  const splitsStandard = detail.splits_standard
    ? detail.splits_standard.map(trimSplit)
    : null;
  const bestEfforts =
    mode === "deep" && detail.best_efforts
      ? detail.best_efforts.map(trimBestEffort)
      : null;

  return {
    athlete_id: athleteId,
    strava_id: a.id,
    start_date_local: a.start_date_local,
    timezone: a.timezone ?? null,
    utc_offset: a.utc_offset ?? null,
    location_city: a.location_city ?? null,
    description: a.description ?? null,
    name: a.name,
    activity_type: activityType,
    distance_m: a.distance,
    moving_time_s: a.moving_time,
    elapsed_time_s: a.elapsed_time ?? null,
    avg_pace_s_per_km: paceSPerKm(a.distance, a.moving_time),
    avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    max_hr: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    avg_watts: isRun ? null : a.average_watts ?? null,
    max_watts: isRun ? null : a.max_watts != null ? Math.round(a.max_watts) : null,
    weighted_avg_watts: isRun ? null : a.weighted_average_watts ?? null,
    kilojoules: isRun ? null : a.kilojoules ?? null,
    device_watts: isRun ? null : a.device_watts ?? null,
    avg_cadence: a.average_cadence ?? null,
    avg_speed_m_s: isRun ? null : a.average_speed ?? null,
    max_speed_m_s: isRun ? null : a.max_speed ?? null,
    suffer_score: a.suffer_score ?? null,
    avg_temp_c: a.average_temp ?? null,
    elevation_gain_m: a.total_elevation_gain ?? null,
    elev_high_m: a.elev_high ?? null,
    elev_low_m: a.elev_low ?? null,
    is_manual: a.manual ?? null,
    is_trainer: a.trainer ?? null,
    is_commute: a.commute ?? null,
    raw: trimRawBlob(a),
    laps: trimmedLaps,
    splits_metric: splitsMetric,
    splits_standard: splitsStandard,
    best_efforts: bestEfforts,
    segment_efforts: null,
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
 * skipped, they'd just be noise.
 *
 * Lap detail is fetched for *every* activity type, not just runs. Ride laps
 * + power data + segment efforts feed the same tool surface Casey uses to
 * answer "when did the HR hit 188 on that ride", and the detail endpoint
 * cost is one read per activity which fits comfortably inside Strava's
 * 100-reads-per-15-min budget at the foreground 12-week scale.
 */
export async function ingestLiveActivitiesForAthlete(
  athleteId: string,
  weeks = 12,
) {
  // Lazy heal: pull sex / weight / display_name from Strava when the
  // athlete row is still empty, AND patch strava_athlete_id on the
  // connection if the OAuth callback couldn't get it (e.g. /athlete was
  // 429-throttled at signup). Once both are populated this short-circuits
  // and never overwrites the athlete's edits.
  await maybeHealConnectionAndDemographics(athleteId);

  const afterSeconds = Math.floor(Date.now() / 1000) - weeks * 7 * 24 * 60 * 60;
  const activities = await fetchActivitiesSince(athleteId, afterSeconds);
  const kept = activities.filter((a) => {
    const cls = classifyActivityType(a.sport_type ?? a.type);
    return cls === "run" || cls === "cross_training" || cls === "catch_all";
  });
  if (kept.length === 0) return 0;

  // Pull detail (laps, splits, best efforts, segment efforts) for every kept
  // activity. Bounded concurrency keeps us inside Strava's rate budget;
  // per-activity failures degrade to the summary row rather than aborting
  // the whole pull. If Strava returns 429 mid-pass we abort the remaining
  // detail fetches outright, the 15-minute window means follow-on requests
  // would just keep 429-ing and burning whatever budget we eventually get
  // back.
  //
  // Important: rows that degrade to summary (whether from 429 or from a
  // one-off transient failure) carry NULL for laps/splits/best_efforts/
  // segment_efforts. If we upsert them blindly, we OVERWRITE detail that
  // a previous ingest fetched successfully, which silently degrades
  // historical workout context until the next manual refresh. So we
  // partition: detail rows safe to upsert, summary rows insert-only via
  // a separate "fill the gap if no row exists" pass below.
  let rateLimited = false;
  const fetched = await mapWithConcurrency<
    StravaActivity,
    | { kind: "detail"; data: StravaActivityDetail }
    | { kind: "summary"; data: StravaActivity }
  >(kept, 5, async (a) => {
    if (rateLimited) return { kind: "summary", data: a };
    try {
      const data = await fetchActivityDetail(athleteId, a.id);
      return { kind: "detail", data };
    } catch (e) {
      if (isRateLimited(e)) {
        if (!rateLimited) {
          console.warn(
            "strava 429 during ingest; falling back to summary for remaining",
            { athleteId, firstHitAt: a.id },
          );
        }
        rateLimited = true;
      } else {
        console.warn("activity detail fetch failed", a.id, e);
      }
      return { kind: "summary", data: a };
    }
  });

  const detailed = fetched
    .filter(
      (r): r is { kind: "detail"; data: StravaActivityDetail } =>
        r.kind === "detail",
    )
    .map((r) => r.data);
  const summarized = fetched
    .filter(
      (r): r is { kind: "summary"; data: StravaActivity } =>
        r.kind === "summary",
    )
    .map((r) => r.data);

  const admin = createAdminClient();

  // Detail rows carry the full payload, safe to upsert (overwriting any
  // stale row keeps the latest stats and the latest detail in sync).
  if (detailed.length > 0) {
    const detailRows = detailed.map((d) =>
      mapStravaActivity(d, athleteId, d.laps ?? null, "detail"),
    );
    const { error } = await admin
      .from("activities")
      .upsert(detailRows, { onConflict: "athlete_id,strava_id" });
    if (error) throw error;
  }

  // Summary rows are insert-only: if a row already exists for the
  // strava_id, leave it alone so we don't blank out detail a previous
  // ingest captured. Brand-new activities still get a row (with NULL
  // detail), which the webhook / cron / chat refresh tool will fill in.
  if (summarized.length > 0) {
    const summaryIds = summarized.map((s) => s.id);
    const { data: existing, error: selErr } = await admin
      .from("activities")
      .select("strava_id")
      .eq("athlete_id", athleteId)
      .in("strava_id", summaryIds);
    if (selErr) throw selErr;
    const existingSet = new Set(
      ((existing ?? []) as Array<{ strava_id: number }>).map((r) => r.strava_id),
    );
    const newRows = summarized
      .filter((s) => !existingSet.has(s.id))
      .map((s) => mapStravaActivity(s, athleteId, null, "summary"));
    if (newRows.length > 0) {
      const { error } = await admin.from("activities").insert(newRows);
      if (error) throw error;
    }
  }

  return kept.length;
}

/**
 * Loads recent runs only. Cross-training is intentionally excluded, the two
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
 * Lazy heal that runs at the top of every ingest pass. Two jobs:
 *
 * 1. Demographics: pull sex / weight / display_name from Strava when the
 *    athlete row hasn't been seeded yet. No-op once everything is set, so
 *    this only ever writes once per athlete and never overwrites their
 *    edits.
 *
 * 2. `strava_athlete_id` on `strava_connections`: when the OAuth callback's
 *    /athlete fallback fetch fails (typically because we're 429'd on the
 *    Strava read budget at signup), the connection row lands with
 *    `strava_athlete_id = null`, which silently breaks the webhook lookup
 *    (events look up by Strava's owner_id). The ingest pass that runs
 *    immediately after the callback gets a second shot at the profile
 *    endpoint and self-heals the connection if it can.
 *
 * Failures are swallowed: ingest must keep working even if the profile
 * endpoint is still rate-limited or the connection is missing the
 * `profile:read_all` scope. The unhealed state self-corrects on a later
 * ingest pass.
 */
async function maybeHealConnectionAndDemographics(
  athleteId: string,
): Promise<void> {
  const admin = createAdminClient();
  const [{ data: athlete }, { data: conn }] = await Promise.all([
    admin
      .from("athletes")
      .select("display_name, sex, weight_kg")
      .eq("id", athleteId)
      .maybeSingle(),
    admin
      .from("strava_connections")
      .select("strava_athlete_id")
      .eq("athlete_id", athleteId)
      .maybeSingle(),
  ]);
  if (!athlete) return;
  const a = athlete as {
    display_name: string | null;
    sex: string | null;
    weight_kg: number | null;
  };
  const c = conn as { strava_athlete_id: number | null } | null;

  const needsAthleteId = c != null && c.strava_athlete_id == null;
  const needsDemographics =
    !a.display_name || !a.sex || a.weight_kg == null;
  if (!needsAthleteId && !needsDemographics) return;

  try {
    const profile = await fetchAthleteProfile(athleteId);
    if (!profile) return;

    if (needsAthleteId && typeof profile.id === "number") {
      await admin
        .from("strava_connections")
        .update({ strava_athlete_id: profile.id })
        .eq("athlete_id", athleteId);
    }

    if (needsDemographics) {
      const update: Record<string, unknown> = {};
      if (!a.display_name && profile.firstname) {
        const trimmed = profile.firstname.trim();
        if (trimmed.length > 0) update.display_name = trimmed;
      }
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
    }
  } catch (e) {
    console.warn("Strava connection/demographic heal failed (non-fatal)", e);
  }
}
