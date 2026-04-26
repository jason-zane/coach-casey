/**
 * Pure EWMA helpers for the load picture. Separated from `load-picture.ts`
 * (which is server-only) so the math is unit-testable in node without
 * stubbing a Supabase client.
 */

export type DailyLoadRow = { day: string; load_au: number };

export const ATL_HALF_LIFE_DAYS = 7;
export const ATL_WINDOW_DAYS = 13;
export const CTL_HALF_LIFE_DAYS = 28;
export const CTL_OFFSET_DAYS = 7;
export const CTL_WINDOW_DAYS = 89;
export const TREND_SAMPLE_DAYS = [0, 7, 14, 21] as const;
export const TREND_RISING_PCT_PER_WEEK = 0.05;

export type LoadTrend = "rising" | "stable" | "falling";

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysAgo(reference: Date, isoDay: string): number {
  const ref = new Date(reference);
  ref.setUTCHours(0, 0, 0, 0);
  const d = new Date(`${isoDay}T00:00:00Z`);
  return Math.round((ref.getTime() - d.getTime()) / DAY_MS);
}

/**
 * Aggregate (date, load) rows by day, summing duplicates. Output is sorted
 * by day ascending. Mirrors the spec's `SUM(n.load_au) GROUP BY day` step.
 */
export function aggregateDailyLoad(
  rows: Array<{ day: string; load_au: number }>,
): DailyLoadRow[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.load_au);
  }
  return [...byDay.entries()]
    .map(([day, load_au]) => ({ day, load_au }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function ewmaWeighted(
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

export function computeAtl(rows: DailyLoadRow[], reference: Date): number {
  return ewmaWeighted(
    rows,
    reference,
    (a) => a >= 0 && a <= ATL_WINDOW_DAYS,
    (a) => Math.exp((-Math.LN2 * a) / ATL_HALF_LIFE_DAYS),
  );
}

export function computeCtl(rows: DailyLoadRow[], reference: Date): number {
  return ewmaWeighted(
    rows,
    reference,
    (a) => a >= CTL_OFFSET_DAYS && a <= CTL_WINDOW_DAYS,
    (a) => Math.exp((-Math.LN2 * (a - CTL_OFFSET_DAYS)) / CTL_HALF_LIFE_DAYS),
  );
}

function ctlAtDaysAgo(rows: DailyLoadRow[], reference: Date, offset: number): number {
  const shifted = new Date(reference.getTime() - offset * DAY_MS);
  return computeCtl(rows, shifted);
}

export function computeTrend(rows: DailyLoadRow[], reference: Date): LoadTrend {
  const samples = TREND_SAMPLE_DAYS.map((offset) =>
    ctlAtDaysAgo(rows, reference, offset),
  );
  const earliest = samples[samples.length - 1];
  if (earliest <= 0) return "stable";
  const latest = samples[0];
  const weeklyPct = (latest - earliest) / earliest / 3;
  if (weeklyPct >= TREND_RISING_PCT_PER_WEEK) return "rising";
  if (weeklyPct <= -TREND_RISING_PCT_PER_WEEK) return "falling";
  return "stable";
}

export function computeThisWeekVsAvg(
  rows: DailyLoadRow[],
  reference: Date,
): number | null {
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
