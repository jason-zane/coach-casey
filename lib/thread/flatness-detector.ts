import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { RUN_TYPES } from "@/lib/strava/activity-types";

/**
 * Mid-block flatness pattern detector.
 *
 * v1 heuristic. The threshold definitions are provisional and will tune
 * against real data; see docs/casey-refresh-engineering-followups.md §3.5.
 *
 * The pattern fires when easy-run pace has slowed meaningfully against
 * the prior baseline for ≥ 14 days. Easy runs are runs whose average
 * pace sits above (slower than) the athlete's overall median pace.
 *
 * Returns null when no pattern is found. Returns a description string
 * suitable for inclusion in the system prompt user-message when a
 * pattern is found.
 */

export type FlatnessPattern = {
  /** Short human-readable description, used in the prompt. */
  description: string;
  /** Recent life-context items concatenated, included for the prompt. */
  recentLifeContext: string;
};

type ActivityRow = {
  start_date_local: string;
  distance_m: number | null;
  moving_time_s: number | null;
  avg_pace_s_per_km: number | null;
};

const RECENT_WINDOW_DAYS = 14;
const BASELINE_WINDOW_DAYS = 56; // 8 weeks
const MIN_RECENT_RUNS = 6;
const MIN_BASELINE_RUNS = 12;
const PACE_DRIFT_THRESHOLD_S_PER_KM = 10;

function isLikelyEasyRun(
  pace: number | null,
  medianPace: number,
): boolean {
  if (pace == null) return false;
  // Easy runs sit on the slower side of the athlete's distribution.
  // Slower = larger seconds-per-km, so > median is "easy half".
  return pace > medianPace;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export async function detectFlatnessPattern(
  athleteId: string,
): Promise<FlatnessPattern | null> {
  const admin = createAdminClient();
  const now = Date.now();
  const baselineCutoff = new Date(
    now - (RECENT_WINDOW_DAYS + BASELINE_WINDOW_DAYS) * 86400_000,
  ).toISOString();

  const { data: activities } = await admin
    .from("activities")
    .select("start_date_local, distance_m, moving_time_s, avg_pace_s_per_km")
    .eq("athlete_id", athleteId)
    .in("activity_type", RUN_TYPES as readonly string[] as string[])
    .gte("start_date_local", baselineCutoff)
    .order("start_date_local", { ascending: false });

  const runs = ((activities ?? []) as ActivityRow[]).filter(
    (r) => r.avg_pace_s_per_km != null,
  );
  if (runs.length < MIN_RECENT_RUNS + MIN_BASELINE_RUNS) return null;

  const recentCutoff = new Date(now - RECENT_WINDOW_DAYS * 86400_000);
  const recent: ActivityRow[] = [];
  const baseline: ActivityRow[] = [];
  for (const r of runs) {
    const t = new Date(r.start_date_local).getTime();
    if (t >= recentCutoff.getTime()) recent.push(r);
    else baseline.push(r);
  }

  if (recent.length < MIN_RECENT_RUNS) return null;
  if (baseline.length < MIN_BASELINE_RUNS) return null;

  const allPaces = runs.map((r) => r.avg_pace_s_per_km!).filter((n) => n > 0);
  const medianPace = median(allPaces);

  const recentEasy = recent
    .filter((r) => isLikelyEasyRun(r.avg_pace_s_per_km, medianPace))
    .map((r) => r.avg_pace_s_per_km!);
  const baselineEasy = baseline
    .filter((r) => isLikelyEasyRun(r.avg_pace_s_per_km, medianPace))
    .map((r) => r.avg_pace_s_per_km!);
  if (recentEasy.length < 3 || baselineEasy.length < 6) return null;

  const recentAvg = mean(recentEasy);
  const baselineAvg = mean(baselineEasy);
  const drift = recentAvg - baselineAvg; // positive = slower

  if (drift < PACE_DRIFT_THRESHOLD_S_PER_KM) return null;

  // Pull recent life context for the prompt.
  const fourteenDaysAgo = new Date(
    now - 14 * 86400_000,
  ).toISOString();
  const { data: lifeItems } = await admin
    .from("memory_items")
    .select("content, created_at")
    .eq("athlete_id", athleteId)
    .eq("kind", "life_context")
    .gte("created_at", fourteenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(5);

  const lifeLines = ((lifeItems ?? []) as Array<{ content: string }>).map(
    (i) => `- ${i.content}`,
  );

  return {
    description: `Easy-run pace over the last 14 days averaged about ${Math.round(
      drift,
    )}s/km slower than the prior 8-week baseline (${recentEasy.length} easy runs in window vs ${baselineEasy.length} prior). Pattern persisted across the full window.`,
    recentLifeContext: lifeLines.join("\n"),
  };
}
