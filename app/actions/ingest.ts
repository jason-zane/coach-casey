"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import {
  extractWorkoutType,
  ingestLiveActivitiesForAthlete,
  ingestMockActivitiesForAthlete,
} from "@/lib/strava/ingest";
import { classifyActivityType } from "@/lib/strava/activity-types";
import {
  classifyWorkout,
  type WorkoutKind,
} from "@/lib/strava/workout-detect";
import type { StravaLap } from "@/lib/strava/client";

export type IngestSummary = {
  status: "ok" | "error" | "empty";
  runCount: number;
  workoutCount: number;
  crossTrainingCount: number;
  weeks: number;
  error?: string;
};

/**
 * Runs the Strava activity pull for the current athlete. Called from the
 * reading-state page so the UI can show its composition copy while this
 * happens, then land on the real count.
 *
 * Workout detection uses the lap-pattern classifier in
 * `lib/strava/workout-detect.ts`, auto-lap easy runs are explicitly excluded
 * even when they have ≥3 laps, since auto-lap on a steady run produces
 * uniform-distance, low-spread laps that aren't actually a session.
 */
export async function runStravaIngest(): Promise<IngestSummary> {
  const weeks = 12;
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();
  const supabase = await createClient();

  // Which flavour of connection do we have?
  const { data: conn } = await admin
    .from("strava_connections")
    .select("is_mock, access_token")
    .eq("athlete_id", athlete.id)
    .maybeSingle();

  if (!conn) {
    return {
      status: "error",
      runCount: 0,
      workoutCount: 0,
      crossTrainingCount: 0,
      weeks,
      error: "No Strava connection yet. Go back and connect.",
    };
  }

  try {
    if (conn.is_mock) {
      await ingestMockActivitiesForAthlete(athlete.id);
    } else {
      await ingestLiveActivitiesForAthlete(athlete.id, weeks);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ingest failed.";
    return {
      status: "error",
      runCount: 0,
      workoutCount: 0,
      crossTrainingCount: 0,
      weeks,
      error: msg,
    };
  }

  // Count what we ended up with
  const since = new Date();
  since.setDate(since.getDate() - weeks * 7);

  const { data: activities } = await supabase
    .from("activities")
    .select(
      "id, activity_type, laps, distance_m, moving_time_s, avg_pace_s_per_km, raw",
    )
    .eq("athlete_id", athlete.id)
    .gte("start_date_local", since.toISOString());

  const rows = activities ?? [];
  let runCount = 0;
  let workoutCount = 0;
  let crossTrainingCount = 0;

  for (const r of rows as Array<{
    activity_type: string | null;
    laps: unknown;
    distance_m: number | null;
    moving_time_s: number | null;
    avg_pace_s_per_km: number | null;
    raw: unknown;
  }>) {
    const cls = classifyActivityType(r.activity_type);
    if (cls === "run") {
      runCount += 1;
      const c = classifyWorkout({
        laps: Array.isArray(r.laps) ? (r.laps as StravaLap[]) : null,
        avgPaceSPerKm: r.avg_pace_s_per_km,
        distanceM: r.distance_m,
        movingTimeS: r.moving_time_s,
        stravaWorkoutType: extractWorkoutType(r.raw),
      });
      const workoutKinds: WorkoutKind[] = [
        "intervals",
        "tempo",
        "progression",
        "race",
      ];
      if (workoutKinds.includes(c.kind) && c.confidence !== "low") {
        workoutCount += 1;
      }
    } else if (cls === "cross_training" || cls === "catch_all") {
      crossTrainingCount += 1;
    }
  }

  if (runCount < 5) {
    return { status: "empty", runCount, workoutCount, crossTrainingCount, weeks };
  }
  return { status: "ok", runCount, workoutCount, crossTrainingCount, weeks };
}
