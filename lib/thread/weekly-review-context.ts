import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { classifyActivityType } from "@/lib/strava/activity-types";
import {
  ageOnDate,
  type MemoryItem,
  type DebriefArcRun,
  type DebriefGoalRace,
  type DebriefWeekAggregate,
} from "./debrief-context";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Trailing window for arc context. Same convention as debriefs (4 weeks),
 * keeps the LLM seeing the same period framing across surfaces and lets
 * the prompt say "in the four-week arc" without surface-specific copy.
 */
const ARC_WEEKS = 4;

export type WeeklyRunSummary = {
  date: string;
  name: string | null;
  distanceKm: number;
  paceSPerKm: number | null;
  avgHr: number | null;
  isWorkout: boolean;
};

export type WeeklyCrossTrainingSummary = {
  date: string;
  name: string | null;
  activityType: string | null;
  durationMinutes: number;
  distanceKm: number | null;
};

export type PriorWeeklyReview = {
  weekStartIso: string;
  body: string;
};

export type WeeklyReviewContext = {
  athleteId: string;
  displayName: string | null;
  sex: "M" | "F" | null;
  weightKg: number | null;
  ageYears: number | null;
  /** Athlete-local ISO date, "YYYY-MM-DD", of the Monday this review covers. */
  weekStartIso: string;
  /** Same shape as athlete-local Sunday inclusive. */
  weekEndIso: string;
  /** Coaching mode at time of review, lets the prompt frame coach-deference vs self-direction. */
  coachingMode: "coach" | "self" | null;
  /** Activities inside the week. */
  weekRuns: WeeklyRunSummary[];
  weekCrossTraining: WeeklyCrossTrainingSummary[];
  /** This week's totals, derived. */
  weekRunCount: number;
  weekRunKm: number;
  /** Trailing 4-week per-week aggregates ending the week before this one. */
  arcWeeks: DebriefWeekAggregate[];
  /** Trailing 4-week run summaries (excluding this week) for arc shape. */
  arcRuns: DebriefArcRun[];
  /** Active plan + upload age. */
  activePlanText: string | null;
  activePlanUploadedAt: string | null;
  /** Memory: niggles + recent life context. */
  injuries: MemoryItem[];
  lifeContext: MemoryItem[];
  /** Goal races, oldest-first. */
  goalRaces: DebriefGoalRace[];
  /** Prior weekly reviews (most recent 3) so the new one doesn't repeat. */
  priorWeeklyReviews: PriorWeeklyReview[];
  /** Most-recent debrief bodies (last 5) for repetition avoidance. */
  priorDebriefBodies: string[];
};

type ActivityRow = {
  start_date_local: string;
  name: string | null;
  activity_type: string | null;
  distance_m: number | null;
  moving_time_s: number | null;
  avg_pace_s_per_km: number | null;
  avg_hr: number | null;
  laps: unknown;
};

function inferIsWorkout(laps: unknown): boolean {
  if (!Array.isArray(laps) || laps.length < 2) return false;
  const paces = laps
    .map((l) => {
      if (l && typeof l === "object" && "average_speed" in l) {
        const speed = (l as { average_speed: number }).average_speed;
        return speed > 0 ? Math.round(1000 / speed) : null;
      }
      return null;
    })
    .filter((p): p is number => p !== null);
  if (paces.length < 2) return false;
  const min = Math.min(...paces);
  const max = Math.max(...paces);
  return max - min >= 30;
}

function bucketRun(row: ActivityRow): WeeklyRunSummary {
  return {
    date: row.start_date_local,
    name: row.name,
    distanceKm: (row.distance_m ?? 0) / 1000,
    paceSPerKm: row.avg_pace_s_per_km,
    avgHr: row.avg_hr,
    isWorkout: inferIsWorkout(row.laps),
  };
}

function bucketCrossTraining(row: ActivityRow): WeeklyCrossTrainingSummary {
  return {
    date: row.start_date_local,
    name: row.name,
    activityType: row.activity_type,
    durationMinutes: Math.round((row.moving_time_s ?? 0) / 60),
    distanceKm:
      row.distance_m && row.distance_m > 0 ? row.distance_m / 1000 : null,
  };
}

function buildArcWeeks(runs: WeeklyRunSummary[]): DebriefWeekAggregate[] {
  const weeks = new Map<string, { km: number; runCount: number }>();
  for (const r of runs) {
    const monday = mondayOfIso(r.date);
    const cur = weeks.get(monday) ?? { km: 0, runCount: 0 };
    cur.km += r.distanceKm;
    cur.runCount += 1;
    weeks.set(monday, cur);
  }
  return Array.from(weeks.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekStart, agg]) => ({
      weekStart,
      km: agg.km,
      runCount: agg.runCount,
    }));
}

/**
 * "YYYY-MM-DD" of the Monday at-or-before the given ISO date, in UTC.
 * Used to bucket activities into weeks for the arc aggregate.
 */
function mondayOfIso(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // 0 = Mon
  const monday = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() - day,
    ),
  );
  return monday.toISOString().slice(0, 10);
}

// Week selection (computePreviousFullWeek, computeCurrentWeek and the
// cron gate) lives in lib/thread/week-window.ts, which stays free of
// "server-only" so plain-Node tests can pin the timing math.

export type BuildWeeklyReviewContextInput = {
  athleteId: string;
  /** Local week start "YYYY-MM-DD" (Monday). */
  weekStartIso: string;
  /** Local week end "YYYY-MM-DD" (Sunday inclusive). */
  weekEndIso: string;
};

export async function buildWeeklyReviewContext(
  input: BuildWeeklyReviewContextInput,
): Promise<WeeklyReviewContext> {
  const admin = createAdminClient();
  const { athleteId, weekStartIso, weekEndIso } = input;

  // Activities query window: from arc-start (4 weeks before week start) to
  // end of week. Single fetch, then partition locally into "this week" vs
  // "arc" buckets so we don't pay for two round-trips.
  const arcStart = new Date(weekStartIso);
  arcStart.setUTCDate(arcStart.getUTCDate() - ARC_WEEKS * 7);
  const arcStartIso = arcStart.toISOString().slice(0, 10);
  // Week-end is inclusive day, push to next-day-00 for the lte boundary
  // so all Sunday activities (in local time) are captured.
  const weekEndExclusive = new Date(weekEndIso);
  weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 1);
  const weekEndExclusiveIso = weekEndExclusive.toISOString();

  const [
    athleteRes,
    preferencesRes,
    activitiesRes,
    memoryRes,
    planRes,
    goalRes,
    priorReviewsRes,
    priorDebriefsRes,
  ] = await Promise.all([
    admin
      .from("athletes")
      .select("display_name, sex, weight_kg, date_of_birth")
      .eq("id", athleteId)
      .single(),
    admin
      .from("preferences")
      .select("coaching_mode")
      .eq("athlete_id", athleteId)
      .maybeSingle(),
    admin
      .from("activities")
      .select(
        "start_date_local, name, activity_type, distance_m, moving_time_s, avg_pace_s_per_km, avg_hr, laps",
      )
      .eq("athlete_id", athleteId)
      .gte("start_date_local", arcStartIso)
      .lt("start_date_local", weekEndExclusiveIso)
      .order("start_date_local", { ascending: true }),
    admin
      .from("memory_items")
      .select("kind, content, tags, created_at")
      .eq("athlete_id", athleteId)
      .order("created_at", { ascending: false })
      .limit(80),
    admin
      .from("training_plans")
      .select("raw_text, created_at")
      .eq("athlete_id", athleteId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("goal_races")
      .select("name, race_date, goal_time_seconds, tier")
      .eq("athlete_id", athleteId)
      .eq("is_active", true)
      .order("race_date", { ascending: true }),
    admin
      .from("messages")
      .select("body, meta, created_at")
      .eq("athlete_id", athleteId)
      .eq("kind", "weekly_review")
      .order("created_at", { ascending: false })
      .limit(3),
    admin
      .from("messages")
      .select("body, created_at")
      .eq("athlete_id", athleteId)
      .eq("kind", "debrief")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (athleteRes.error || !athleteRes.data) {
    throw new Error(`athlete ${athleteId} not found`);
  }
  const a = athleteRes.data as {
    display_name: string | null;
    sex: string | null;
    weight_kg: number | null;
    date_of_birth: string | null;
  };
  const sex: "M" | "F" | null =
    a.sex === "M" || a.sex === "F" ? (a.sex as "M" | "F") : null;
  const ageYears = a.date_of_birth
    ? ageOnDate(a.date_of_birth, weekEndIso)
    : null;
  const prefRow = preferencesRes.data as { coaching_mode: string | null } | null;
  const coachingMode: WeeklyReviewContext["coachingMode"] =
    prefRow?.coaching_mode === "coach" || prefRow?.coaching_mode === "self"
      ? prefRow.coaching_mode
      : null;

  const activities = (activitiesRes.data ?? []) as ActivityRow[];

  const inWeek = (row: ActivityRow): boolean => {
    const day = row.start_date_local.slice(0, 10);
    return day >= weekStartIso && day <= weekEndIso;
  };
  const isRun = (row: ActivityRow) =>
    classifyActivityType(row.activity_type) === "run";
  const isCrossTraining = (row: ActivityRow) => {
    const cls = classifyActivityType(row.activity_type);
    return cls === "cross_training" || cls === "catch_all";
  };

  const weekRuns = activities.filter((r) => inWeek(r) && isRun(r)).map(bucketRun);
  const weekCrossTraining = activities
    .filter((r) => inWeek(r) && isCrossTraining(r))
    .map(bucketCrossTraining);
  const arcRunRows = activities.filter((r) => !inWeek(r) && isRun(r));
  const arcRuns = arcRunRows.map(bucketRun);
  const arcWeeks = buildArcWeeks(arcRuns);

  const memoryRows = (memoryRes.data ?? []) as Array<{
    kind: string;
    content: string;
    tags: string[] | null;
    created_at: string;
  }>;
  const fourteenDaysAgoIso = new Date(
    new Date(weekEndIso).getTime() - 14 * DAY_MS,
  )
    .toISOString()
    .slice(0, 10);
  const injuries: MemoryItem[] = memoryRows
    .filter((m) => m.kind === "injury")
    .map((m) => ({
      kind: m.kind,
      content: m.content,
      tags: m.tags ?? [],
      createdAt: m.created_at,
    }));
  const lifeContext: MemoryItem[] = memoryRows
    .filter((m) => m.kind === "context" && m.created_at.slice(0, 10) >= fourteenDaysAgoIso)
    .map((m) => ({
      kind: m.kind,
      content: m.content,
      tags: m.tags ?? [],
      createdAt: m.created_at,
    }));

  const planRow = planRes.data as
    | { raw_text: string | null; created_at: string }
    | null;
  const goalRaces: DebriefGoalRace[] = ((goalRes.data ?? []) as Array<{
    name: string | null;
    race_date: string | null;
    goal_time_seconds: number | null;
    tier: "A" | "B" | "C" | null;
  }>).map((g) => ({
    name: g.name,
    raceDate: g.race_date,
    goalTimeSeconds: g.goal_time_seconds,
    tier: g.tier,
  }));

  const priorWeeklyReviews: PriorWeeklyReview[] = (
    (priorReviewsRes.data ?? []) as Array<{
      body: string;
      meta: { week_start_iso?: string } | null;
      created_at: string;
    }>
  ).map((m) => ({
    weekStartIso: m.meta?.week_start_iso ?? m.created_at.slice(0, 10),
    body: m.body,
  }));
  const priorDebriefBodies: string[] = (
    (priorDebriefsRes.data ?? []) as Array<{ body: string }>
  ).map((m) => m.body);

  const weekRunCount = weekRuns.length;
  const weekRunKm = weekRuns.reduce((sum, r) => sum + r.distanceKm, 0);

  return {
    athleteId,
    displayName: a.display_name,
    sex,
    weightKg: a.weight_kg != null ? Number(a.weight_kg) : null,
    ageYears,
    weekStartIso,
    weekEndIso,
    coachingMode,
    weekRuns,
    weekCrossTraining,
    weekRunCount,
    weekRunKm,
    arcWeeks,
    arcRuns,
    activePlanText: planRow?.raw_text ?? null,
    activePlanUploadedAt: planRow?.created_at ?? null,
    injuries,
    lifeContext,
    goalRaces,
    priorWeeklyReviews,
    priorDebriefBodies,
  };
}
