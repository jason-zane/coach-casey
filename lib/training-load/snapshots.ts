import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { profileFromRace, vdotFromRace } from "./vdot";

/**
 * Snapshot read/write helpers. Append-only by discipline — the only
 * mutation we ever do on an existing row is the `pending_review` flag.
 *
 * The "current" snapshot for an athlete is the most recent row by
 * `snapshot_date` with `pending_review = false`. Functions in this file
 * also expose date-bounded variants used by the load calculator's
 * backfill case (spec §4.6 — historical activities calculate against
 * the threshold that was active *at that date*, not the latest).
 */

export type SnapshotSource = "race" | "tempo_estimate" | "shadow" | "manual";
export type SnapshotConfidence = "high" | "medium" | "low";

export type ProfileSnapshot = {
  id: string;
  athleteId: string;
  snapshotDate: string;
  source: SnapshotSource;
  sourceActivityId: string | null;
  vdot: number | null;
  thresholdPaceSecPerKm: number | null;
  easyPaceSecPerKmLow: number | null;
  easyPaceSecPerKmHigh: number | null;
  marathonPaceSecPerKm: number | null;
  intervalPaceSecPerKm: number | null;
  repetitionPaceSecPerKm: number | null;
  confidence: SnapshotConfidence;
  pendingReview: boolean;
  createdAt: string;
};

type SnapshotRow = {
  id: string;
  athlete_id: string;
  snapshot_date: string;
  source: SnapshotSource;
  source_activity_id: string | null;
  vdot: number | null;
  threshold_pace_sec_per_km: number | null;
  easy_pace_sec_per_km_low: number | null;
  easy_pace_sec_per_km_high: number | null;
  marathon_pace_sec_per_km: number | null;
  interval_pace_sec_per_km: number | null;
  repetition_pace_sec_per_km: number | null;
  confidence: SnapshotConfidence;
  pending_review: boolean;
  created_at: string;
};

function rowToSnapshot(row: SnapshotRow): ProfileSnapshot {
  return {
    id: row.id,
    athleteId: row.athlete_id,
    snapshotDate: row.snapshot_date,
    source: row.source,
    sourceActivityId: row.source_activity_id,
    vdot: row.vdot,
    thresholdPaceSecPerKm: row.threshold_pace_sec_per_km,
    easyPaceSecPerKmLow: row.easy_pace_sec_per_km_low,
    easyPaceSecPerKmHigh: row.easy_pace_sec_per_km_high,
    marathonPaceSecPerKm: row.marathon_pace_sec_per_km,
    intervalPaceSecPerKm: row.interval_pace_sec_per_km,
    repetitionPaceSecPerKm: row.repetition_pace_sec_per_km,
    confidence: row.confidence,
    pendingReview: row.pending_review,
    createdAt: row.created_at,
  };
}

const SNAPSHOT_COLS =
  "id, athlete_id, snapshot_date, source, source_activity_id, vdot, threshold_pace_sec_per_km, easy_pace_sec_per_km_low, easy_pace_sec_per_km_high, marathon_pace_sec_per_km, interval_pace_sec_per_km, repetition_pace_sec_per_km, confidence, pending_review, created_at";

/**
 * Most recent active snapshot for an athlete (excludes pending_review).
 * Null when the athlete has none yet.
 */
export async function getCurrentSnapshot(
  athleteId: string,
): Promise<ProfileSnapshot | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profile_snapshots")
    .select(SNAPSHOT_COLS)
    .eq("athlete_id", athleteId)
    .eq("pending_review", false)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSnapshot(data as SnapshotRow) : null;
}

/**
 * Snapshot active on a given date. Used when calculating load for a
 * backfilled activity — we want the threshold the athlete was operating
 * under at that date, not today's threshold (spec §4.6).
 */
export async function getSnapshotAtDate(
  athleteId: string,
  isoDate: string,
): Promise<ProfileSnapshot | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profile_snapshots")
    .select(SNAPSHOT_COLS)
    .eq("athlete_id", athleteId)
    .eq("pending_review", false)
    .lte("snapshot_date", isoDate)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSnapshot(data as SnapshotRow) : null;
}

export type AppendSnapshotInput = {
  athleteId: string;
  snapshotDate: string; // YYYY-MM-DD
  source: SnapshotSource;
  sourceActivityId?: string | null;
  vdot: number;
  confidence: SnapshotConfidence;
  pendingReview?: boolean;
};

export type AppendSnapshotResult = {
  snapshot: ProfileSnapshot;
  /** Previous active snapshot (if any) — surfaced so the caller can drive recalc. */
  previous: ProfileSnapshot | null;
};

/**
 * Insert a new snapshot row. Derives all pace fields from the VDOT so
 * the caller doesn't have to. Returns the new snapshot and the previous
 * active snapshot it superseded (null if the athlete had none).
 */
export async function appendSnapshot(
  input: AppendSnapshotInput,
): Promise<AppendSnapshotResult> {
  const previous = await getCurrentSnapshot(input.athleteId);
  const zones = (await import("./vdot")).paceZonesFromVdot(input.vdot);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profile_snapshots")
    .insert({
      athlete_id: input.athleteId,
      snapshot_date: input.snapshotDate,
      source: input.source,
      source_activity_id: input.sourceActivityId ?? null,
      vdot: input.vdot,
      threshold_pace_sec_per_km: zones.thresholdPaceSecPerKm,
      easy_pace_sec_per_km_low: zones.easyPaceSecPerKmLow,
      easy_pace_sec_per_km_high: zones.easyPaceSecPerKmHigh,
      marathon_pace_sec_per_km: zones.marathonPaceSecPerKm,
      interval_pace_sec_per_km: zones.intervalPaceSecPerKm,
      repetition_pace_sec_per_km: zones.repetitionPaceSecPerKm,
      confidence: input.confidence,
      pending_review: input.pendingReview ?? false,
    })
    .select(SNAPSHOT_COLS)
    .single();
  if (error) throw error;
  return {
    snapshot: rowToSnapshot(data as SnapshotRow),
    previous,
  };
}

/**
 * Decision returned by `evaluateRaceForSnapshot`. The caller (ingest path)
 * acts on it: insert + recalc, insert + flag, or no-op.
 */
export type RaceEvaluation =
  | { kind: "insert"; vdot: number; confidence: SnapshotConfidence }
  | { kind: "insert_pending_review"; vdot: number }
  | { kind: "no_change"; reason: "within_one_vdot" | "lower_inside_grace" };

const DOWNWARD_REVISION_VDOT_GRACE = 1.0;

/**
 * Evaluate a race-grade activity against the current snapshot. Returns
 * the decision; the caller persists it. Pure-ish (only the snapshot read
 * is non-pure, and that's a pre-step the caller can supply).
 */
export function evaluateRaceForSnapshot(
  newVdot: number,
  current: ProfileSnapshot | null,
): RaceEvaluation {
  if (!current || current.vdot == null) {
    return { kind: "insert", vdot: newVdot, confidence: "high" };
  }
  const delta = newVdot - current.vdot;
  if (delta > 0) {
    if (delta < DOWNWARD_REVISION_VDOT_GRACE) {
      // Modest improvement — still worth recording (athlete will see it
      // reflected in subsequent prompts) but stays high-confidence.
      return { kind: "insert", vdot: newVdot, confidence: "high" };
    }
    return { kind: "insert", vdot: newVdot, confidence: "high" };
  }
  // delta <= 0: race confirms or is below current.
  if (Math.abs(delta) <= DOWNWARD_REVISION_VDOT_GRACE) {
    return { kind: "no_change", reason: "within_one_vdot" };
  }
  // More than 1 VDOT lower — flag rather than apply.
  return { kind: "insert_pending_review", vdot: newVdot };
}

/**
 * Convenience: derive VDOT from race inputs and run `evaluateRaceForSnapshot`.
 */
export function evaluateRaceFromInputs(
  distanceMeters: number,
  durationSeconds: number,
  current: ProfileSnapshot | null,
): { evaluation: RaceEvaluation; vdot: number; profile: ReturnType<typeof profileFromRace> } {
  const profile = profileFromRace({ distanceMeters, durationSeconds });
  const vdot = vdotFromRace({ distanceMeters, durationSeconds });
  const evaluation = evaluateRaceForSnapshot(vdot, current);
  return { evaluation, vdot, profile };
}

export const RACE_VDOT_GRACE = DOWNWARD_REVISION_VDOT_GRACE;
