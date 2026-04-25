import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { calculateLoad, type LoadActivityInput } from "./load";
import { getSnapshotAtDate } from "./snapshots";

/**
 * Persist the load calculation for a single activity. Idempotent — a
 * repeat call replaces the existing values and updates the timestamp.
 *
 * Always writes a row to activity_notes (creates one if none exists).
 * When inputs are missing (no duration, no pace), the load columns are
 * cleared to NULL rather than left stale.
 *
 * The function reads the snapshot active at the activity's `start_date_local`
 * — not today's snapshot — so backfilled history calculates against the
 * threshold the athlete was operating under at that date (spec §4.6).
 */
export async function calculateAndPersistLoadForActivity(
  athleteId: string,
  activityId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: activity, error: actErr } = await admin
    .from("activities")
    .select("id, athlete_id, start_date_local, activity_type, distance_m, moving_time_s, avg_pace_s_per_km, raw")
    .eq("id", activityId)
    .maybeSingle();
  if (actErr) throw actErr;
  if (!activity) return;
  const row = activity as {
    id: string;
    athlete_id: string;
    start_date_local: string;
    activity_type: string | null;
    distance_m: number | null;
    moving_time_s: number | null;
    avg_pace_s_per_km: number | null;
    raw: unknown;
  };
  if (row.athlete_id !== athleteId) {
    throw new Error(
      `activity ${activityId} not owned by athlete ${athleteId}`,
    );
  }

  const snapshot = await getSnapshotAtDate(athleteId, row.start_date_local);

  const input: LoadActivityInput = {
    activityType: row.activity_type,
    movingTimeS: row.moving_time_s,
    avgPaceSPerKm: row.avg_pace_s_per_km,
    gapSecPerKm: extractGapSecPerKm(row.raw, row.distance_m),
    stravaWorkoutType: extractWorkoutType(row.raw),
  };

  const result = calculateLoad(input, {
    thresholdPaceSecPerKm: snapshot?.thresholdPaceSecPerKm ?? null,
  });

  const now = new Date().toISOString();
  const update = result
    ? {
        load_au: result.loadAu,
        load_method: result.loadMethod,
        load_if: result.loadIf,
        load_calculated_at: now,
      }
    : {
        load_au: null,
        load_method: null,
        load_if: null,
        load_calculated_at: now,
      };

  // Upsert the activity_notes row. Schema: `activity_id` is unique. Existing
  // RPE columns are left untouched by the partial update; the insert path
  // creates a fresh row when no notes row exists yet.
  const { error: upErr } = await admin
    .from("activity_notes")
    .upsert(
      {
        activity_id: activityId,
        athlete_id: athleteId,
        ...update,
      },
      { onConflict: "activity_id" },
    );
  if (upErr) throw upErr;

  logLoadCalculation({
    athleteId,
    activityId,
    method: result?.loadMethod ?? null,
    loadAu: result?.loadAu ?? null,
    intensityFactor: result?.loadIf ?? null,
    durationS: row.moving_time_s,
    snapshotConfidence: snapshot?.confidence ?? null,
  });
}

/**
 * Strava's detail payload exposes grade-adjusted speed for runs with
 * recorded streams. The summary endpoint we currently store doesn't
 * include it, so this helper returns null today — the load calculator
 * falls back to raw avg pace per spec §4.1. When/if we start storing
 * the GAP stream, this is the integration point.
 */
function extractGapSecPerKm(
  raw: unknown,
  distanceM: number | null,
): number | null {
  if (!raw || typeof raw !== "object" || distanceM == null || distanceM <= 0) {
    return null;
  }
  // Strava sometimes carries `average_grade_adjusted_pace` (s/km) on detail
  // responses for run activities. Read it through if present.
  const r = raw as { average_grade_adjusted_pace?: unknown };
  if (typeof r.average_grade_adjusted_pace === "number" && r.average_grade_adjusted_pace > 0) {
    return r.average_grade_adjusted_pace;
  }
  return null;
}

function extractWorkoutType(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const wt = (raw as { workout_type?: unknown }).workout_type;
  return typeof wt === "number" ? wt : null;
}

type LoadCalcLog = {
  athleteId: string;
  activityId: string;
  method: string | null;
  loadAu: number | null;
  intensityFactor: number | null;
  durationS: number | null;
  snapshotConfidence: string | null;
};

/**
 * Structured log line for every calculation. Per build-standards §4 — JSON
 * over freeform, no PII. Sentry remains the destination for genuine
 * failures (which `throw` from the calculator, surfaced one level up).
 */
function logLoadCalculation(entry: LoadCalcLog): void {
  // `console.log` is fine here: Vercel forwards stdout to its log surface
  // and any future log shipper picks it up. The shape is the contract.
  console.log(
    JSON.stringify({
      event: "training_load.calculate",
      ...entry,
    }),
  );
}
