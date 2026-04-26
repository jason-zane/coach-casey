import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentSnapshot, type ProfileSnapshot } from "./snapshots";
import {
  aggregateDailyLoad,
  computeAtl,
  computeCtl,
  computeThisWeekVsAvg,
  computeTrend,
  CTL_WINDOW_DAYS,
  type LoadTrend,
} from "./ewma";

/**
 * Load picture: ATL/CTL + trend + threshold context, for a single athlete.
 * Computed on read at prompt-build time per spec §6 — never cached, never
 * stored. Single helper, called from every consumer (debrief context,
 * weekly review, chat).
 *
 * Pure EWMA helpers live in `./ewma` so the math is unit-testable without
 * a Supabase client. This module wires them to the activity_notes data.
 */

export type { LoadTrend };

export type LoadPicture = {
  atlAu: number;
  ctlAu: number;
  /** ATL / CTL when CTL > 0; null otherwise (no chronic baseline yet). */
  atlCtlRatio: number | null;
  trend4Weeks: LoadTrend;
  /**
   * Percentage difference between this calendar week's load and the trailing
   * 4-week weekly average. Positive = above average. Null when no baseline.
   */
  thisWeekVs4WkAvgPct: number | null;
  /** True when there's no load history at all (first 24 hours / fresh athlete). */
  isEmpty: boolean;
};

export type ThresholdContext = {
  thresholdPaceSecPerKm: number | null;
  vdot: number | null;
  snapshotDate: string | null;
  confidence: ProfileSnapshot["confidence"] | null;
  source: ProfileSnapshot["source"] | null;
};

export type FullLoadPicture = {
  loadPicture: LoadPicture;
  thresholdContext: ThresholdContext;
  /** Optional: load attached to the activity that triggered the prompt. */
  thisActivity?: { loadAu: number | null; loadMethod: string | null };
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Read the load picture for an athlete. Single round-trip to fetch the
 * 90-day per-activity load + the current snapshot; everything else is
 * computed in JS.
 */
export async function getLoadPicture(
  athleteId: string,
  options?: { activityId?: string | null; now?: Date },
): Promise<FullLoadPicture> {
  const reference = options?.now ?? new Date();
  const since = new Date(reference.getTime() - (CTL_WINDOW_DAYS + 1) * DAY_MS);

  const admin = createAdminClient();
  const [loadRes, snapshot, thisActivityNote] = await Promise.all([
    admin
      .from("activity_notes")
      .select("load_au, activities!inner(start_date_local)")
      .eq("athlete_id", athleteId)
      .not("load_au", "is", null)
      .gte("activities.start_date_local", since.toISOString()),
    getCurrentSnapshot(athleteId),
    options?.activityId
      ? admin
          .from("activity_notes")
          .select("load_au, load_method")
          .eq("activity_id", options.activityId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (loadRes.error) throw loadRes.error;
  if (thisActivityNote.error) throw thisActivityNote.error;

  type RawLoadRow = {
    load_au: number;
    activities: { start_date_local: string };
  };
  const dailyRows = aggregateDailyLoad(
    ((loadRes.data ?? []) as unknown as RawLoadRow[])
      .filter((r) => r.activities && r.activities.start_date_local)
      .map((r) => ({
        day: r.activities.start_date_local.slice(0, 10),
        load_au: Number(r.load_au),
      })),
  );

  const isEmpty = dailyRows.length === 0;

  const atl = computeAtl(dailyRows, reference);
  const ctl = computeCtl(dailyRows, reference);

  const loadPicture: LoadPicture = {
    atlAu: round1(atl),
    ctlAu: round1(ctl),
    atlCtlRatio: ctl > 0 ? round2(atl / ctl) : null,
    trend4Weeks: computeTrend(dailyRows, reference),
    thisWeekVs4WkAvgPct: computeThisWeekVsAvg(dailyRows, reference),
    isEmpty,
  };

  const thresholdContext: ThresholdContext = snapshot
    ? {
        thresholdPaceSecPerKm: snapshot.thresholdPaceSecPerKm,
        vdot: snapshot.vdot,
        snapshotDate: snapshot.snapshotDate,
        confidence: snapshot.confidence,
        source: snapshot.source,
      }
    : {
        thresholdPaceSecPerKm: null,
        vdot: null,
        snapshotDate: null,
        confidence: null,
        source: null,
      };

  const thisActivity = thisActivityNote.data
    ? {
        loadAu: (thisActivityNote.data as { load_au: number | null }).load_au,
        loadMethod: (thisActivityNote.data as { load_method: string | null }).load_method,
      }
    : undefined;

  return { loadPicture, thresholdContext, thisActivity };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ActivityLoadSample = {
  loadAu: number;
  loadIf: number | null;
};

/**
 * Recent (default 30 day) per-activity load samples for an athlete.
 * Used by the RPE-branched picker to apply the spec §7.4 heuristics
 * (top-25% load → hard intent, bottom-50% + low IF → easy intent).
 *
 * Cheap query — same index as the load picture. The caller batches it
 * with the picker args.
 */
export async function getRecentLoadSamples(
  athleteId: string,
  options: { days?: number; now?: Date; excludeActivityId?: string | null } = {},
): Promise<ActivityLoadSample[]> {
  const now = options.now ?? new Date();
  const days = options.days ?? 30;
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const admin = createAdminClient();
  let query = admin
    .from("activity_notes")
    .select("load_au, load_if, activity_id, activities!inner(start_date_local)")
    .eq("athlete_id", athleteId)
    .not("load_au", "is", null)
    .gte("activities.start_date_local", since.toISOString());
  if (options.excludeActivityId) {
    query = query.neq("activity_id", options.excludeActivityId);
  }
  const { data, error } = await query;
  if (error) throw error;

  type Row = { load_au: number; load_if: number | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    loadAu: Number(r.load_au),
    loadIf: r.load_if != null ? Number(r.load_if) : null,
  }));
}

/**
 * Look up this activity's load row (load_au + load_if). Returns null when
 * the row doesn't exist or load hasn't been calculated yet.
 */
export async function getActivityLoadSample(
  activityId: string,
): Promise<ActivityLoadSample | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activity_notes")
    .select("load_au, load_if")
    .eq("activity_id", activityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { load_au: number | null; load_if: number | null };
  if (row.load_au == null) return null;
  return { loadAu: Number(row.load_au), loadIf: row.load_if != null ? Number(row.load_if) : null };
}
