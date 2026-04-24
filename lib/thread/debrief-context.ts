import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type DebriefLap = {
  idx: number;
  km: number;
  paceSPerKm: number | null;
  hr: number | null;
};

export type DebriefActivity = {
  id: string;
  strava_id: number | null;
  date: string; // ISO
  dayOfWeek: string; // "Tue" | ...
  name: string | null;
  activityType: string | null;
  distanceKm: number;
  movingTimeS: number;
  paceSPerKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevGainM: number | null;
  laps: DebriefLap[];
  /** True when laps show ≥30s/km spread — treat as a workout, not a steady run. */
  hasWorkoutShape: boolean;
};

export type DebriefArcRun = {
  date: string;
  name: string | null;
  distanceKm: number;
  paceSPerKm: number | null;
  avgHr: number | null;
  isWorkout: boolean;
};

export type DebriefWeekAggregate = {
  weekStart: string;
  km: number;
  runCount: number;
};

export type MemoryItem = {
  kind: string;
  content: string;
  tags: string[];
  createdAt: string;
};

export type DebriefGoalRace = {
  name: string | null;
  raceDate: string | null;
  goalTimeSeconds: number | null;
};

export type PriorDebrief = {
  createdAt: string;
  activityDate: string | null;
  body: string;
};

export type DebriefContext = {
  athleteId: string;
  displayName: string | null;
  activity: DebriefActivity;
  arcWeeks: DebriefWeekAggregate[];
  arcRuns: DebriefArcRun[];
  activePlanText: string | null;
  injuries: MemoryItem[];
  lifeContext: MemoryItem[];
  goalRaces: DebriefGoalRace[];
  priorDebriefs: PriorDebrief[];
  isFirstDebrief: boolean;
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

function paceSPerKm(distanceM: number | null, movingTimeS: number | null): number | null {
  if (!distanceM || !movingTimeS) return null;
  const km = distanceM / 1000;
  if (km <= 0) return null;
  return Math.round(movingTimeS / km);
}

type RawLap = {
  distance?: number;
  moving_time?: number;
  average_heartrate?: number;
};

function parseLaps(raw: unknown): DebriefLap[] {
  if (!Array.isArray(raw)) return [];
  const laps = raw as RawLap[];
  return laps
    .map((l, idx): DebriefLap | null => {
      if (!l.distance || !l.moving_time || l.distance < 200) return null;
      const pace = Math.round(l.moving_time / (l.distance / 1000));
      return {
        idx: idx + 1,
        km: Number((l.distance / 1000).toFixed(2)),
        paceSPerKm: pace,
        hr: l.average_heartrate ? Math.round(l.average_heartrate) : null,
      };
    })
    .filter((l): l is DebriefLap => l !== null);
}

function workoutShape(laps: DebriefLap[]): boolean {
  if (laps.length < 2) return false;
  const paces = laps
    .map((l) => l.paceSPerKm)
    .filter((p): p is number => p !== null);
  if (paces.length < 2) return false;
  const min = Math.min(...paces);
  const max = Math.max(...paces);
  return max - min >= 30;
}

function isoMonday(d: Date): string {
  const monday = new Date(d);
  const day = (d.getDay() + 6) % 7;
  monday.setDate(d.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

type ActivityRow = {
  id: string;
  strava_id: number | null;
  start_date_local: string;
  name: string | null;
  activity_type: string | null;
  distance_m: number | null;
  moving_time_s: number | null;
  avg_pace_s_per_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain_m: number | null;
  laps: unknown;
};

function toDebriefActivity(row: ActivityRow): DebriefActivity {
  const laps = parseLaps(row.laps);
  const distanceKm = Number(((row.distance_m ?? 0) / 1000).toFixed(2));
  const date = row.start_date_local;
  const dow = DAY_NAMES[new Date(date).getDay()];
  return {
    id: row.id,
    strava_id: row.strava_id,
    date,
    dayOfWeek: dow,
    name: row.name,
    activityType: row.activity_type,
    distanceKm,
    movingTimeS: row.moving_time_s ?? 0,
    paceSPerKm: row.avg_pace_s_per_km ?? paceSPerKm(row.distance_m, row.moving_time_s),
    avgHr: row.avg_hr,
    maxHr: row.max_hr,
    elevGainM: row.elevation_gain_m != null ? Number(row.elevation_gain_m) : null,
    laps,
    hasWorkoutShape: workoutShape(laps),
  };
}

function toArcRun(row: ActivityRow): DebriefArcRun {
  const laps = parseLaps(row.laps);
  return {
    date: row.start_date_local,
    name: row.name,
    distanceKm: Number(((row.distance_m ?? 0) / 1000).toFixed(2)),
    paceSPerKm: row.avg_pace_s_per_km ?? paceSPerKm(row.distance_m, row.moving_time_s),
    avgHr: row.avg_hr,
    isWorkout: workoutShape(laps),
  };
}

function aggregateWeeks(runs: DebriefArcRun[]): DebriefWeekAggregate[] {
  const by = new Map<string, DebriefWeekAggregate>();
  for (const r of runs) {
    const key = isoMonday(new Date(r.date));
    const agg = by.get(key) ?? { weekStart: key, km: 0, runCount: 0 };
    agg.km += r.distanceKm;
    agg.runCount += 1;
    by.set(key, agg);
  }
  return [...by.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/**
 * Assembles the full context a post-run debrief needs. Keyed on a single
 * activity, with the arc, plan, memory, and prior debriefs layered around it.
 *
 * Uses the admin client — the caller (server action, webhook, cron) has
 * already resolved authorisation.
 */
export async function buildDebriefContext(
  athleteId: string,
  activityId: string,
  {
    arcWeeks = 6,
    recentLifeContextDays = 14,
    priorDebriefCount = 3,
  }: {
    arcWeeks?: number;
    recentLifeContextDays?: number;
    priorDebriefCount?: number;
  } = {},
): Promise<DebriefContext> {
  const admin = createAdminClient();

  const activityRes = await admin
    .from("activities")
    .select(
      "id, strava_id, start_date_local, name, activity_type, distance_m, moving_time_s, avg_pace_s_per_km, avg_hr, max_hr, elevation_gain_m, laps",
    )
    .eq("id", activityId)
    .eq("athlete_id", athleteId)
    .maybeSingle();
  if (activityRes.error) throw activityRes.error;
  if (!activityRes.data) {
    throw new Error(`activity ${activityId} not found for athlete ${athleteId}`);
  }
  const activity = toDebriefActivity(activityRes.data as ActivityRow);

  // Arc runs: last N weeks prior to *this* activity (exclusive). Windowed on
  // start_date_local rather than ingested_at so a backfilled ride still sees
  // the surrounding training.
  const arcStart = new Date(new Date(activity.date).getTime() - arcWeeks * 7 * DAY_MS);
  const lifeStart = new Date(
    new Date(activity.date).getTime() - recentLifeContextDays * DAY_MS,
  );

  const [
    athleteRes,
    arcRes,
    memRes,
    planRes,
    racesRes,
    priorDebriefsRes,
  ] = await Promise.all([
    admin.from("athletes").select("id, display_name").eq("id", athleteId).single(),
    admin
      .from("activities")
      .select(
        "id, strava_id, start_date_local, name, activity_type, distance_m, moving_time_s, avg_pace_s_per_km, avg_hr, max_hr, elevation_gain_m, laps",
      )
      .eq("athlete_id", athleteId)
      .neq("id", activityId)
      .gte("start_date_local", arcStart.toISOString())
      .lte("start_date_local", activity.date)
      .order("start_date_local", { ascending: true }),
    admin
      .from("memory_items")
      .select("kind, content, tags, created_at")
      .eq("athlete_id", athleteId)
      .order("created_at", { ascending: false })
      .limit(80),
    admin
      .from("training_plans")
      .select("raw_text")
      .eq("athlete_id", athleteId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("goal_races")
      .select("name, race_date, goal_time_seconds")
      .eq("athlete_id", athleteId)
      .eq("is_active", true)
      .order("race_date", { ascending: true }),
    admin
      .from("messages")
      .select("created_at, body, meta")
      .eq("athlete_id", athleteId)
      .eq("kind", "debrief")
      .order("created_at", { ascending: false })
      .limit(priorDebriefCount),
  ]);

  const arcRows = (arcRes.data ?? []) as ActivityRow[];
  const arcRuns = arcRows.map(toArcRun);

  const memRows = ((memRes.data ?? []) as {
    kind: string;
    content: string;
    tags: string[] | null;
    created_at: string;
  }[]).map((m) => ({
    kind: m.kind,
    content: m.content,
    tags: m.tags ?? [],
    createdAt: m.created_at,
  }));

  // Injury items: keep all (they don't age out like life context).
  const injuries = memRows.filter((m) => m.kind === "injury");
  // Life context: recent window only.
  const lifeContext = memRows.filter(
    (m) => m.kind === "context" && m.createdAt >= lifeStart.toISOString(),
  );

  const goalRaces = ((racesRes.data ?? []) as {
    name: string | null;
    race_date: string | null;
    goal_time_seconds: number | null;
  }[]).map((r) => ({
    name: r.name,
    raceDate: r.race_date,
    goalTimeSeconds: r.goal_time_seconds,
  }));

  const priorDebriefs = ((priorDebriefsRes.data ?? []) as {
    created_at: string;
    body: string;
    meta: Record<string, unknown> | null;
  }[]).map((d) => ({
    createdAt: d.created_at,
    activityDate: typeof d.meta?.activity_date === "string" ? d.meta.activity_date : null,
    body: d.body,
  }));

  return {
    athleteId,
    displayName: (athleteRes.data?.display_name as string | null) ?? null,
    activity,
    arcWeeks: aggregateWeeks(arcRuns),
    arcRuns,
    activePlanText: (planRes.data?.raw_text as string | null) ?? null,
    injuries,
    lifeContext,
    goalRaces,
    priorDebriefs,
    isFirstDebrief: priorDebriefs.length === 0,
  };
}
