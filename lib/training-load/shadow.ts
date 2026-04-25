import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { isRunType } from "@/lib/strava/activity-types";
import { appendSnapshot, getCurrentSnapshot } from "./snapshots";
import { paceZonesFromVdot } from "./vdot";

/**
 * Shadow threshold derivation. Used when no race-derived snapshot exists.
 * Computes a low-confidence threshold from the athlete's hardest sustained
 * 20-minute effort in the trailing 60 days, with the conventional Friel
 * 5% adjustment from "20-min hard" to "threshold".
 *
 * Per spec §5.4 — runs weekly, or on-demand when the load pipeline
 * encounters tier-2 conditions.
 */

const LOOKBACK_DAYS = 60;
const TWENTY_MIN_S = 20 * 60;
const FRIEL_ADJUSTMENT = 1.05;

type CandidateActivity = {
  id: string;
  start_date_local: string;
  activity_type: string | null;
  distance_m: number | null;
  moving_time_s: number | null;
  avg_pace_s_per_km: number | null;
};

/**
 * Estimate the fastest 20-minute effort within an activity. We don't store
 * pace streams, so this is a constant-pace approximation: if the activity
 * is at least 20 minutes long, treat its average pace as the best
 * sustained 20-minute pace. Crude — a workout's hardest 20-min block is
 * faster than the activity average — but defensible while we don't ingest
 * streams. The Friel ×1.05 adjustment compounds with this conservatism;
 * the resulting shadow threshold tends to err *slow*, which is the
 * preferable failure mode (under-rates load rather than inflating it).
 */
function bestTwentyMinPace(a: CandidateActivity): number | null {
  if (
    a.moving_time_s == null ||
    a.moving_time_s < TWENTY_MIN_S ||
    a.avg_pace_s_per_km == null ||
    a.avg_pace_s_per_km <= 0
  ) {
    return null;
  }
  return a.avg_pace_s_per_km;
}

/**
 * Convert threshold pace (s/km) back to a velocity-anchored VDOT estimate.
 * Used purely so the shadow snapshot has a vdot field for the prompt
 * context — the threshold pace itself is the load-calculation input.
 *
 * Inverts the Daniels–Gilbert oxygen-cost equation at 88% of vVO2max.
 */
function vdotFromThresholdPace(thresholdPaceSecPerKm: number): number {
  const vMetersPerMin = 60_000 / thresholdPaceSecPerKm;
  // VO2 at threshold pace.
  const vo2 = -4.6 + 0.182258 * vMetersPerMin + 0.000104 * vMetersPerMin * vMetersPerMin;
  // Threshold corresponds to ~88% of vVO2max in Daniels' framework.
  return vo2 / 0.88;
}

export type ShadowResult =
  | { kind: "appended"; vdot: number; thresholdPaceSecPerKm: number; sourceActivityCount: number }
  | { kind: "skipped"; reason: "no_candidates" | "race_snapshot_present" };

/**
 * Compute and persist a shadow snapshot for a single athlete. Skips
 * when:
 *   - there are no eligible run activities in the lookback window, or
 *   - the athlete already has a race-derived snapshot (we let that
 *     remain authoritative).
 */
export async function refreshShadowSnapshotForAthlete(
  athleteId: string,
  reference?: { now?: Date },
): Promise<ShadowResult> {
  const now = reference?.now ?? new Date();

  const current = await getCurrentSnapshot(athleteId);
  if (current && current.source === "race") {
    return { kind: "skipped", reason: "race_snapshot_present" };
  }

  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activities")
    .select("id, start_date_local, activity_type, distance_m, moving_time_s, avg_pace_s_per_km")
    .eq("athlete_id", athleteId)
    .gte("start_date_local", since.toISOString())
    .gte("moving_time_s", TWENTY_MIN_S)
    .order("start_date_local", { ascending: false });
  if (error) throw error;

  const candidates = ((data ?? []) as CandidateActivity[]).filter((a) =>
    isRunType(a.activity_type),
  );
  if (candidates.length === 0) {
    return { kind: "skipped", reason: "no_candidates" };
  }

  let bestPace: number | null = null;
  let bestActivityDate: string | null = null;
  for (const c of candidates) {
    const pace = bestTwentyMinPace(c);
    if (pace == null) continue;
    if (bestPace == null || pace < bestPace) {
      bestPace = pace;
      bestActivityDate = c.start_date_local;
    }
  }
  if (bestPace == null || bestActivityDate == null) {
    return { kind: "skipped", reason: "no_candidates" };
  }

  const thresholdPace = bestPace * FRIEL_ADJUSTMENT;
  const vdot = vdotFromThresholdPace(thresholdPace);

  // Sanity check the derived zones (paceZonesFromVdot will throw on
  // pathological VDOTs — better to skip the snapshot than to write a
  // nonsense one).
  try {
    paceZonesFromVdot(vdot);
  } catch (e) {
    console.warn("training_load.shadow.derive_skipped", {
      athleteId,
      thresholdPace,
      vdot,
      error: e instanceof Error ? e.message : String(e),
    });
    return { kind: "skipped", reason: "no_candidates" };
  }

  await appendSnapshot({
    athleteId,
    snapshotDate: bestActivityDate.slice(0, 10),
    source: "shadow",
    vdot,
    confidence: "low",
  });

  return {
    kind: "appended",
    vdot,
    thresholdPaceSecPerKm: thresholdPace,
    sourceActivityCount: candidates.length,
  };
}

/**
 * Iterate the shadow refresh across every athlete who currently has no
 * snapshot or only shadow snapshots. Designed to be called from a
 * scheduled cron route.
 */
export async function refreshShadowSnapshotsForAllEligible(): Promise<{
  scanned: number;
  appended: number;
  skipped: number;
  errors: number;
}> {
  const admin = createAdminClient();
  // Scope to athletes with at least one activity. A future filter on
  // pending recent activity would reduce wasted scans further.
  const { data: athletes, error } = await admin
    .from("athletes")
    .select("id");
  if (error) throw error;

  let scanned = 0;
  let appended = 0;
  let skipped = 0;
  let errors = 0;
  for (const a of (athletes ?? []) as Array<{ id: string }>) {
    scanned += 1;
    try {
      const result = await refreshShadowSnapshotForAthlete(a.id);
      if (result.kind === "appended") appended += 1;
      else skipped += 1;
    } catch (e) {
      errors += 1;
      console.error("training_load.shadow.refresh_failed", {
        athleteId: a.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { scanned, appended, skipped, errors };
}

