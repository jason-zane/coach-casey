import "server-only";
import { isRunType } from "@/lib/strava/activity-types";
import { calculateAndPersistLoadForActivity } from "./calculator";
import { isRaceCandidate } from "./race-detect";
import { scheduleRecalculation } from "./recalc";
import {
  appendSnapshot,
  evaluateRaceForSnapshot,
  getCurrentSnapshot,
  type ProfileSnapshot,
} from "./snapshots";
import { vdotFromRace } from "./vdot";

/**
 * Post-ingest hook for the Strava webhook + cron paths. For every activity
 * that lands:
 *
 *   1. If the activity is race-grade, evaluate against the current snapshot
 *      and append a fresh one (high-confidence on improvement; pending
 *      review on a >1-VDOT downward revision; no-op otherwise).
 *   2. If a fresh snapshot was inserted with a different threshold, schedule
 *      load recalculation for the affected window (spec §4.5).
 *   3. Calculate and persist load for the activity itself.
 *
 * Runs after the activity row is upserted. Tolerant to missing data —
 * each step is independent and a failure is caught + logged so a problem
 * in the snapshot path doesn't suppress the load write (or vice versa).
 */
export async function runPostIngestForActivity(
  athleteId: string,
  activityId: string,
  activity: {
    name: string | null;
    activityType: string | null;
    movingTimeS: number | null;
    distanceM: number | null;
    startDateLocal: string;
    stravaWorkoutType: number | null;
  },
): Promise<void> {
  let snapshotChanged: { previousDate: string | null } | null = null;

  if (isRunType(activity.activityType)) {
    try {
      snapshotChanged = await maybeAppendRaceSnapshot(athleteId, activityId, activity);
    } catch (e) {
      console.error("training_load.post_ingest.snapshot_failed", {
        athleteId,
        activityId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  try {
    await calculateAndPersistLoadForActivity(athleteId, activityId);
  } catch (e) {
    console.error("training_load.post_ingest.calc_failed", {
      athleteId,
      activityId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  if (snapshotChanged) {
    // First-ever threshold (no previous snapshot): recalculate the
    // athlete's full history. The 90-day load window already bounds
    // the meaningful work, but we cast wider here so a backfilled
    // ride sequence is also coherent.
    const fromDate =
      snapshotChanged.previousDate ??
      new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    scheduleRecalculation(athleteId, fromDate);
  }
}

async function maybeAppendRaceSnapshot(
  athleteId: string,
  activityId: string,
  activity: {
    name: string | null;
    movingTimeS: number | null;
    distanceM: number | null;
    startDateLocal: string;
    stravaWorkoutType: number | null;
  },
): Promise<{ previousDate: string | null } | null> {
  const isRace = isRaceCandidate({
    name: activity.name,
    movingTimeS: activity.movingTimeS,
    distanceM: activity.distanceM,
    stravaWorkoutType: activity.stravaWorkoutType,
  });
  if (!isRace) return null;

  const distance = activity.distanceM ?? 0;
  const duration = activity.movingTimeS ?? 0;
  if (distance <= 0 || duration <= 0) return null;

  const newVdot = vdotFromRace({
    distanceMeters: distance,
    durationSeconds: duration,
  });
  const current: ProfileSnapshot | null = await getCurrentSnapshot(athleteId);
  const decision = evaluateRaceForSnapshot(newVdot, current);

  if (decision.kind === "no_change") return null;

  const isPending = decision.kind === "insert_pending_review";
  const confidence = isPending ? "low" : decision.confidence;

  await appendSnapshot({
    athleteId,
    snapshotDate: activity.startDateLocal.slice(0, 10),
    source: "race",
    sourceActivityId: activityId,
    vdot: decision.vdot,
    confidence,
    pendingReview: isPending,
  });

  if (isPending) return null;
  return { previousDate: current?.snapshotDate ?? null };
}
