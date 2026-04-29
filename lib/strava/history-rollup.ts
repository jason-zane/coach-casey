import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { classifyActivityType } from "./activity-types";

/**
 * Per-month rollup of activities older than the 12-week foreground window.
 * Cached on `athletes.monthly_history_rollup` and recomputed when the
 * long-history backfill lands or is upgraded (e.g. two_years → all_time).
 *
 * Covers both running and cross-training (rides, swims, gym, yoga, etc.) in
 * parallel fields per month so Casey can read the shape of the *full*
 * training load over time, not just the running side.
 *
 * Shape stays small on purpose, the chat prompt renders this as ~24 lines max
 * and Casey reaches for the DB lookup tool when they need anything finer.
 */
export type MonthlyRollupEntry = {
  month: string; // YYYY-MM
  // Running totals.
  run_distance_km: number;
  run_count: number;
  longest_run_km: number;
  races: number;
  // Cross-training totals (rides, swims, gym, yoga, anything classified
  // cross_training or catch_all). Distance can be 0 for non-distance work
  // like gym; total_minutes is the more universal signal.
  cross_distance_km: number;
  cross_count: number;
  cross_total_minutes: number;
};

const RECENT_WINDOW_WEEKS = 12;

function recentBoundaryIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - RECENT_WINDOW_WEEKS * 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function monthKey(iso: string): string {
  // start_date_local is timezone-naive ISO. Slice is enough for month bucketing
  // and avoids a round-trip through Date for thousands of rows.
  return iso.slice(0, 7);
}

/**
 * Aggregate activities older than the 12-week recent window into per-month
 * rollups (run distance, count, longest run, race count). Persisted to
 * `athletes.monthly_history_rollup` so the chat prompt can render it cheaply
 * each turn.
 *
 * Returns the rollup so callers (tests, ad-hoc invocation) can inspect it
 * without re-reading the row.
 */
export async function computeAndPersistMonthlyRollup(
  athleteId: string,
): Promise<MonthlyRollupEntry[]> {
  const admin = createAdminClient();
  const before = recentBoundaryIso();

  const { data, error } = await admin
    .from("activities")
    .select("start_date_local, activity_type, distance_m, moving_time_s, name, raw")
    .eq("athlete_id", athleteId)
    .lt("start_date_local", before)
    .order("start_date_local", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    start_date_local: string;
    activity_type: string | null;
    distance_m: number | null;
    moving_time_s: number | null;
    name: string | null;
    raw: unknown;
  }>;

  function emptyEntry(month: string): MonthlyRollupEntry {
    return {
      month,
      run_distance_km: 0,
      run_count: 0,
      longest_run_km: 0,
      races: 0,
      cross_distance_km: 0,
      cross_count: 0,
      cross_total_minutes: 0,
    };
  }

  const buckets = new Map<string, MonthlyRollupEntry>();
  for (const r of rows) {
    const cls = classifyActivityType(r.activity_type);
    const isRun = cls === "run";
    const isCross = cls === "cross_training" || cls === "catch_all";
    if (!isRun && !isCross) continue;

    const km = (r.distance_m ?? 0) / 1000;
    const minutes =
      r.moving_time_s != null ? Math.round(r.moving_time_s / 60) : 0;

    const key = monthKey(r.start_date_local);
    const entry = buckets.get(key) ?? emptyEntry(key);

    if (isRun) {
      if (km <= 0) continue;
      entry.run_distance_km += km;
      entry.run_count += 1;
      if (km > entry.longest_run_km) entry.longest_run_km = km;
      if (isLikelyRace(r.name, r.raw)) entry.races += 1;
    } else {
      // Cross-training: count and total minutes always; distance only when
      // it was a distance-bearing activity.
      entry.cross_count += 1;
      entry.cross_total_minutes += minutes;
      if (km > 0) entry.cross_distance_km += km;
    }
    buckets.set(key, entry);
  }

  // Round once at persist time so the prompt rendering layer stays trivial.
  const rollup: MonthlyRollupEntry[] = Array.from(buckets.values())
    .map((e) => ({
      ...e,
      run_distance_km: Math.round(e.run_distance_km),
      longest_run_km: Math.round(e.longest_run_km * 10) / 10,
      cross_distance_km: Math.round(e.cross_distance_km),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  await admin
    .from("athletes")
    .update({
      monthly_history_rollup: rollup,
      monthly_history_rollup_updated_at: new Date().toISOString(),
    })
    .eq("id", athleteId);

  return rollup;
}

function isLikelyRace(name: string | null, raw: unknown): boolean {
  // Strava's workout_type=1 is "Race". Athletes don't always tag, so also
  // pattern-match the activity name as a soft signal. False positives here
  // are cheap (a stray race count in a month rollup) so we err on inclusive.
  if (raw && typeof raw === "object") {
    const wt = (raw as { workout_type?: unknown }).workout_type;
    if (typeof wt === "number" && wt === 1) return true;
  }
  if (!name) return false;
  return /\b(race|marathon|half|10k|5k|parkrun)\b/i.test(name);
}

/**
 * Render the cached rollup as the long-history block for the chat prompt.
 * Returns `null` when no rollup exists yet (backfill hasn't landed) so the
 * caller can omit the section entirely rather than show an empty header.
 *
 * Capped at the most-recent 24 months to keep the prompt cheap; older months
 * are still in the DB and reachable via the `query_training_history` tool.
 */
export function renderRollupForPrompt(
  rollup: MonthlyRollupEntry[] | null,
): string | null {
  if (!rollup || rollup.length === 0) return null;
  const recent = rollup.slice(-24);
  const lines = recent.map((e) => {
    const runPart =
      e.run_count > 0
        ? `${e.run_distance_km} km running across ${e.run_count} run${e.run_count === 1 ? "" : "s"}, longest ${e.longest_run_km} km`
        : "no running";
    const racePart = e.races > 0 ? `, ${e.races} race${e.races === 1 ? "" : "s"}` : "";
    const crossPart =
      e.cross_count > 0
        ? `; cross-training ${e.cross_count} session${e.cross_count === 1 ? "" : "s"}` +
          (e.cross_distance_km > 0 ? `, ${e.cross_distance_km} km` : "") +
          (e.cross_total_minutes > 0 ? `, ${e.cross_total_minutes} min` : "")
        : "";
    return `- ${e.month}: ${runPart}${racePart}${crossPart}`;
  });
  const oldest = recent[0].month;
  const newest = recent[recent.length - 1].month;
  return `Long history rollup (older than 12 weeks, ${oldest} to ${newest}):\n${lines.join("\n")}`;
}
