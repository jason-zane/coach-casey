import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentSnapshot, type ProfileSnapshot } from "./snapshots";

/**
 * Load picture: ATL/CTL + trend + threshold context, for a single athlete.
 * Computed on read at prompt-build time per spec §6 — never cached, never
 * stored. Single helper, called from every consumer (debrief context,
 * weekly review, chat).
 *
 * EWMA parameters per spec §6.1:
 *   - ATL half-life 7 days, window days 0..13
 *   - CTL half-life 28 days, window days 7..89 (uncoupled)
 *
 * Trend: slope of weekly CTL samples per spec §6.5.
 */

const ATL_HALF_LIFE_DAYS = 7;
const ATL_WINDOW_DAYS = 13;
const CTL_HALF_LIFE_DAYS = 28;
const CTL_OFFSET_DAYS = 7;
const CTL_WINDOW_DAYS = 89;
const TREND_SAMPLE_DAYS = [0, 7, 14, 21] as const;
const TREND_RISING_PCT_PER_WEEK = 0.05;

export type LoadTrend = "rising" | "stable" | "falling";

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

type DailyLoadRow = { day: string; load_au: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(reference: Date, isoDay: string): number {
  const ref = new Date(reference);
  ref.setUTCHours(0, 0, 0, 0);
  const d = new Date(`${isoDay}T00:00:00Z`);
  return Math.round((ref.getTime() - d.getTime()) / DAY_MS);
}

function ewmaWeighted(
  rows: DailyLoadRow[],
  reference: Date,
  predicate: (daysAgo: number) => boolean,
  weight: (daysAgo: number) => number,
): number {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const row of rows) {
    const ago = daysAgo(reference, row.day);
    if (!predicate(ago)) continue;
    const w = weight(ago);
    weightedSum += row.load_au * w;
    weightTotal += w;
  }
  if (weightTotal === 0) return 0;
  return weightedSum / weightTotal;
}

function fetchDailyLoad(rows: DailyLoadRow[]): DailyLoadRow[] {
  // Aggregate by day in JS — Supabase JS client can't express SUM-by-day in
  // a single round-trip without an RPC, and a single window of ≤ ~125 rows
  // is trivial to fold here. The spec mentions an RPC option; we can swap
  // when query volume justifies it.
  const byDay = new Map<string, number>();
  for (const r of rows) {
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.load_au);
  }
  return [...byDay.entries()]
    .map(([day, load_au]) => ({ day, load_au }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function ctlAtDaysAgo(rows: DailyLoadRow[], reference: Date, offset: number): number {
  // Re-anchor the reference date by `offset` days. The CTL formula stays
  // identical; we're sampling the chronic value as it would have read on
  // an earlier calendar day.
  const shifted = new Date(reference.getTime() - offset * DAY_MS);
  return ewmaWeighted(
    rows,
    shifted,
    (a) => a >= CTL_OFFSET_DAYS && a <= CTL_WINDOW_DAYS,
    (a) => Math.exp((-Math.LN2 * (a - CTL_OFFSET_DAYS)) / CTL_HALF_LIFE_DAYS),
  );
}

function computeTrend(rows: DailyLoadRow[], reference: Date): LoadTrend {
  const samples = TREND_SAMPLE_DAYS.map((offset) => ctlAtDaysAgo(rows, reference, offset));
  // Need a non-zero baseline to compute a percentage slope. If everything
  // is zero, the athlete has no chronic load yet — call it "stable" as the
  // neutral value.
  const earliest = samples[samples.length - 1];
  if (earliest <= 0) return "stable";
  const latest = samples[0];
  // Per-week slope = (latest - earliest) / earliest / 3 weeks of distance.
  const weeklyPct = (latest - earliest) / earliest / 3;
  if (weeklyPct >= TREND_RISING_PCT_PER_WEEK) return "rising";
  if (weeklyPct <= -TREND_RISING_PCT_PER_WEEK) return "falling";
  return "stable";
}

function computeThisWeekVsAvg(
  rows: DailyLoadRow[],
  reference: Date,
): number | null {
  // "This calendar week" = trailing 7 days from the reference. "4-week avg"
  // = trailing 28 days, divided by 4. Simpler than calendar-week boundaries
  // and consistent across timezones.
  const sumWindow = (lower: number, upper: number) => {
    let s = 0;
    for (const row of rows) {
      const ago = daysAgo(reference, row.day);
      if (ago >= lower && ago <= upper) s += row.load_au;
    }
    return s;
  };
  const thisWeek = sumWindow(0, 6);
  const fourWeekTotal = sumWindow(0, 27);
  const fourWeekAvg = fourWeekTotal / 4;
  if (fourWeekAvg <= 0) return null;
  return Math.round(((thisWeek - fourWeekAvg) / fourWeekAvg) * 100);
}

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
  const dailyRows = fetchDailyLoad(
    ((loadRes.data ?? []) as unknown as RawLoadRow[])
      .filter((r) => r.activities && r.activities.start_date_local)
      .map((r) => ({
        day: r.activities.start_date_local.slice(0, 10),
        load_au: Number(r.load_au),
      })),
  );

  const isEmpty = dailyRows.length === 0;

  const atl = ewmaWeighted(
    dailyRows,
    reference,
    (a) => a >= 0 && a <= ATL_WINDOW_DAYS,
    (a) => Math.exp((-Math.LN2 * a) / ATL_HALF_LIFE_DAYS),
  );
  const ctl = ewmaWeighted(
    dailyRows,
    reference,
    (a) => a >= CTL_OFFSET_DAYS && a <= CTL_WINDOW_DAYS,
    (a) => Math.exp((-Math.LN2 * (a - CTL_OFFSET_DAYS)) / CTL_HALF_LIFE_DAYS),
  );

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
