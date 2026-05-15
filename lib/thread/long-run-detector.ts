import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Tomorrow long-run detector.
 *
 * v1 heuristic. Detects whether the athlete is likely to do a long run
 * tomorrow, used to gate the pre-run fuelling nudge.
 *
 * The plan-extraction layer (`training_plans.raw_text`) is free text
 * today, not structured per-day. Until that lands, we rely on a
 * recurring-pattern heuristic: if the same day-of-week has carried the
 * longest run in 3 of the last 4 weeks, and the duration of those long
 * runs averaged > 75 min, assume tomorrow will be a long run for that
 * pattern.
 *
 * Returns null when no pattern is detected (the surface stays silent).
 * Returns the planned-run shape and a stable key for idempotency when
 * a pattern is detected.
 */

export type PlannedLongRun = {
  /** Stable key used by the action for idempotency. */
  key: string;
  estimatedDurationMinutes: number;
  variant: "long" | "mp-long" | "depleted" | "hard-long" | null;
  knownFuelingPattern: string | null;
};

type ActivityRow = {
  start_date_local: string;
  moving_time_s: number | null;
  distance_m: number | null;
};

function localWeekday(tz: string | null, when: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz ?? "UTC",
    weekday: "short",
  });
  const day = fmt.format(when);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

function localDateIso(tz: string | null, when: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

export async function detectTomorrowLongRun(
  athleteId: string,
  tz: string | null,
  now: Date,
): Promise<PlannedLongRun | null> {
  const admin = createAdminClient();

  // Activities in the last 4 weeks.
  const fourWeeksAgo = new Date(now.getTime() - 28 * 86400_000).toISOString();
  const { data: activities } = await admin
    .from("activities")
    .select("start_date_local, moving_time_s, distance_m")
    .eq("athlete_id", athleteId)
    .eq("activity_type", "Run")
    .gte("start_date_local", fourWeeksAgo)
    .order("start_date_local", { ascending: false });

  const runs = ((activities ?? []) as ActivityRow[]).filter(
    (r) => r.moving_time_s && r.moving_time_s > 0,
  );
  if (runs.length < 8) return null;

  // Group into ISO-week buckets, then find the longest run in each week.
  type WeekBucket = {
    weekKey: string;
    runs: Array<{ weekday: number; durationMin: number }>;
  };
  const weeks = new Map<string, WeekBucket>();
  for (const r of runs) {
    const t = new Date(r.start_date_local);
    // ISO-week key: year + week-of-year
    const weekStart = new Date(t);
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
    const weekKey = weekStart.toISOString().slice(0, 10);
    const weekday = localWeekday(tz, t);
    const durationMin = Math.round((r.moving_time_s ?? 0) / 60);
    const existing = weeks.get(weekKey) ?? { weekKey, runs: [] };
    existing.runs.push({ weekday, durationMin });
    weeks.set(weekKey, existing);
  }

  if (weeks.size < 3) return null;

  // For each week, find the longest run's weekday.
  const longRunDays: number[] = [];
  const longRunDurations: number[] = [];
  for (const bucket of weeks.values()) {
    const longest = bucket.runs.reduce(
      (best, r) => (r.durationMin > best.durationMin ? r : best),
      bucket.runs[0],
    );
    if (longest.durationMin > 75) {
      longRunDays.push(longest.weekday);
      longRunDurations.push(longest.durationMin);
    }
  }
  if (longRunDays.length < 3) return null;

  // Find the modal weekday.
  const counts = new Map<number, number>();
  for (const d of longRunDays) counts.set(d, (counts.get(d) ?? 0) + 1);
  let modalDay = longRunDays[0];
  let modalCount = 0;
  for (const [d, c] of counts) {
    if (c > modalCount) {
      modalDay = d;
      modalCount = c;
    }
  }
  if (modalCount < 3) return null;

  // Is tomorrow that day?
  const tomorrow = new Date(now.getTime() + 86400_000);
  const tomorrowWeekday = localWeekday(tz, tomorrow);
  if (tomorrowWeekday !== modalDay) return null;

  const avgDuration = Math.round(
    longRunDurations.reduce((a, b) => a + b, 0) / longRunDurations.length,
  );
  if (avgDuration <= 75) return null;

  // Look up known fuelling pattern from memory items.
  const { data: fuel } = await admin
    .from("memory_items")
    .select("content")
    .eq("athlete_id", athleteId)
    .contains("tags", ["fueling"])
    .order("created_at", { ascending: false })
    .limit(1);
  const knownFuelingPattern =
    (((fuel ?? []) as Array<{ content: string }>)[0]?.content) ?? null;

  const key = `${athleteId}:${localDateIso(tz, tomorrow)}:long`;

  return {
    key,
    estimatedDurationMinutes: avgDuration,
    variant: "long",
    knownFuelingPattern,
  };
}
