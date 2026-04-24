"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import {
  ingestLiveActivitiesForAthlete,
  ingestMockActivitiesForAthlete,
} from "@/lib/strava/ingest";

export type IngestSummary = {
  status: "ok" | "error" | "empty";
  runCount: number;
  workoutCount: number;
  weeks: number;
  error?: string;
};

/**
 * Runs the Strava activity pull for the current athlete. Called from the
 * reading-state page so the UI can show its composition copy while this
 * happens, then land on the real count.
 *
 * Heuristic for "workout": activity has at least 3 laps with a pace spread
 * of >= 30 s/km across them. Rough but readable — matches what the LLM
 * context builder surfaces.
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
      weeks,
      error: msg,
    };
  }

  // Count what we ended up with
  const since = new Date();
  since.setDate(since.getDate() - weeks * 7);

  const { data: activities } = await supabase
    .from("activities")
    .select("id, laps")
    .eq("athlete_id", athlete.id)
    .gte("start_date_local", since.toISOString());

  const rows = activities ?? [];
  const runCount = rows.length;
  const workoutCount = rows.filter((r) => isWorkout(r.laps)).length;

  if (runCount < 5) {
    return { status: "empty", runCount, workoutCount, weeks };
  }
  return { status: "ok", runCount, workoutCount, weeks };
}

type LapRow = { distance?: number; moving_time?: number };

function isWorkout(laps: unknown): boolean {
  if (!Array.isArray(laps) || laps.length < 3) return false;
  const paces = (laps as LapRow[])
    .map((l) => {
      if (!l.distance || !l.moving_time || l.distance < 200) return null;
      return Math.round(l.moving_time / (l.distance / 1000));
    })
    .filter((p): p is number => p !== null);
  if (paces.length < 3) return false;
  const min = Math.min(...paces);
  const max = Math.max(...paces);
  return max - min >= 30;
}
