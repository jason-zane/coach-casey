import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { classifyActivityType } from "@/lib/strava/activity-types";

export type CrossTrainingActivity = {
  id: string;
  strava_id: number | null;
  date: string; // ISO start_date_local
  dayOfWeek: string; // "Tue" | "Wed" | ...
  activityType: string | null;
  activityClass: "cross_training" | "catch_all";
  name: string | null;
  durationMinutes: number | null;
  distanceKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevGainM: number | null;
};

export type CrossTrainingPattern = {
  isPattern: boolean;
  /** Free-form description used in the prompt context, e.g. "Tuesday gym, 4 of the last 4 weeks". Null when no pattern. */
  description: string | null;
};

export type CrossTrainingArcRun = {
  date: string;
  name: string | null;
  distanceKm: number;
  paceSPerKm: number | null;
  avgHr: number | null;
};

export type CrossTrainingMemoryItem = {
  kind: string;
  content: string;
  tags: string[];
  createdAt: string;
};

export type CrossTrainingContext = {
  athleteId: string;
  displayName: string | null;
  timezone: string | null;
  activity: CrossTrainingActivity;
  pattern: CrossTrainingPattern;
  /** Active injuries and niggles from memory_items. */
  injuries: CrossTrainingMemoryItem[];
  /** Life-context items from the last 14 days (sleep, work, travel, etc.). */
  lifeContext: CrossTrainingMemoryItem[];
  /** Last ~10 runs. Shape the prompt uses to anchor "the running picture". */
  recentRuns: CrossTrainingArcRun[];
  /** Active plan text when present, same raw_text the debrief pipeline reads. */
  activePlanText: string | null;
  /** Whether this athlete has any prior cross-training acknowledgement. */
  isFirstCrossTrainingAck: boolean;
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const FULL_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

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
};

/**
 * Compute the 0-6 day-of-week for a timestamp interpreted in a given
 * timezone. Falls back to UTC when tz is null (existing athletes without
 * timezone captured, see scale_foundations migration).
 */
function dayOfWeekInTz(iso: string, tz: string | null): number {
  const d = new Date(iso);
  if (!tz) {
    return d.getUTCDay();
  }
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    });
    const label = fmt.format(d);
    const idx = DAY_NAMES.findIndex((n) => n === label);
    return idx >= 0 ? idx : d.getUTCDay();
  } catch {
    // Invalid tz string, fall through. Should never happen with IANA names
    // but we're defensive because this runs in the generation hot path.
    return d.getUTCDay();
  }
}

function toActivity(
  row: ActivityRow,
  tz: string | null,
): CrossTrainingActivity {
  const cls = classifyActivityType(row.activity_type);
  const distanceKm = row.distance_m != null ? row.distance_m / 1000 : null;
  const durationMinutes = row.moving_time_s != null ? row.moving_time_s / 60 : null;
  const dow = dayOfWeekInTz(row.start_date_local, tz);
  return {
    id: row.id,
    strava_id: row.strava_id,
    date: row.start_date_local,
    dayOfWeek: DAY_NAMES[dow],
    activityType: row.activity_type,
    activityClass: cls === "run" || cls === "ambient" ? "catch_all" : cls,
    name: row.name,
    durationMinutes: durationMinutes != null ? Number(durationMinutes.toFixed(1)) : null,
    distanceKm: distanceKm != null ? Number(distanceKm.toFixed(2)) : null,
    avgHr: row.avg_hr,
    maxHr: row.max_hr,
    elevGainM: row.elevation_gain_m != null ? Number(row.elevation_gain_m) : null,
  };
}

/**
 * Pattern detection: same activity_type, same day-of-week (in athlete tz),
 * 3+ occurrences in the last 4 weeks, excluding the current activity.
 *
 * Returned as a free-form description used in the prompt, the prompt reads
 * the description, not the raw count. "Tuesday gym, 4 of the last 4 weeks"
 * is the target shape.
 */
async function detectPattern(
  athleteId: string,
  activity: CrossTrainingActivity,
  tz: string | null,
): Promise<CrossTrainingPattern> {
  if (!activity.activityType) {
    return { isPattern: false, description: null };
  }
  const admin = createAdminClient();
  const windowStart = new Date(Date.now() - 4 * 7 * DAY_MS).toISOString();

  // Pull all same-type activities in the 4-week window, excluding the
  // current one. Bucket by day-of-week in the athlete's timezone. This is
  // done in JS rather than SQL because day-of-week in an arbitrary IANA
  // timezone isn't a trivial SQL expression, and the volume per athlete is
  // small (typically single digits).
  const { data, error } = await admin
    .from("activities")
    .select("id, start_date_local, activity_type")
    .eq("athlete_id", athleteId)
    .eq("activity_type", activity.activityType)
    .gte("start_date_local", windowStart)
    .neq("id", activity.id);
  if (error) {
    // Pattern detection failing should not block generation, the prompt
    // still works without pattern context. Log and fall through.
    console.warn("cross-training pattern query failed", error);
    return { isPattern: false, description: null };
  }

  const targetDow = dayOfWeekInTz(activity.date, tz);
  const counts = new Map<string, Set<string>>();
  for (const row of (data ?? []) as { id: string; start_date_local: string }[]) {
    const dow = dayOfWeekInTz(row.start_date_local, tz);
    if (dow !== targetDow) continue;
    // Bucket by local date so two sessions on the same day count once.
    const dateKey = row.start_date_local.slice(0, 10);
    const set = counts.get(String(dow)) ?? new Set<string>();
    set.add(dateKey);
    counts.set(String(dow), set);
  }

  const hits = counts.get(String(targetDow))?.size ?? 0;
  if (hits < 3) return { isPattern: false, description: null };

  const dayName = FULL_DAY_NAMES[targetDow];
  const typeLabel = labelForActivityType(activity.activityType);
  const description = `${dayName} ${typeLabel}, ${hits} of the last 4 weeks`;
  return { isPattern: true, description };
}

function labelForActivityType(type: string): string {
  // Keep the label close to Strava's name but lowercase so the description
  // reads like natural prose. "Ride" → "ride", "WeightTraining" → "gym".
  const map: Record<string, string> = {
    Ride: "ride",
    VirtualRide: "ride",
    EBikeRide: "ride",
    Swim: "swim",
    Workout: "gym",
    WeightTraining: "gym",
    Yoga: "yoga",
    Pilates: "pilates",
  };
  return map[type] ?? type.toLowerCase();
}

type MemoryRow = {
  kind: string;
  content: string;
  tags: string[] | null;
  created_at: string;
};

function paceSPerKm(distanceM: number | null, movingTimeS: number | null): number | null {
  if (!distanceM || !movingTimeS) return null;
  const km = distanceM / 1000;
  if (km <= 0) return null;
  return Math.round(movingTimeS / km);
}

/**
 * Assemble the full context a cross-training acknowledgement needs. Keyed
 * on a single activity, with pattern detection, memory, and a slim run
 * summary layered around it.
 *
 * Uses the admin client, caller (webhook, cron, dev) has already resolved
 * authorisation.
 */
export async function buildCrossTrainingContext(
  athleteId: string,
  activityId: string,
): Promise<CrossTrainingContext> {
  const admin = createAdminClient();

  const athleteRes = await admin
    .from("athletes")
    .select("id, display_name, timezone")
    .eq("id", athleteId)
    .single();
  if (athleteRes.error) throw athleteRes.error;
  const tz = (athleteRes.data?.timezone as string | null) ?? null;
  const displayName = (athleteRes.data?.display_name as string | null) ?? null;

  const activityRes = await admin
    .from("activities")
    .select(
      "id, strava_id, start_date_local, name, activity_type, distance_m, moving_time_s, avg_pace_s_per_km, avg_hr, max_hr, elevation_gain_m",
    )
    .eq("id", activityId)
    .eq("athlete_id", athleteId)
    .maybeSingle();
  if (activityRes.error) throw activityRes.error;
  if (!activityRes.data) {
    throw new Error(`activity ${activityId} not found for athlete ${athleteId}`);
  }
  const activity = toActivity(activityRes.data as ActivityRow, tz);

  const lifeStart = new Date(Date.now() - 14 * DAY_MS).toISOString();
  const arcStart = new Date(
    new Date(activity.date).getTime() - 4 * 7 * DAY_MS,
  ).toISOString();

  const [pattern, memRes, planRes, priorAckRes, recentRunsRes] = await Promise.all([
    detectPattern(athleteId, activity, tz),
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
      .from("messages")
      .select("id")
      .eq("athlete_id", athleteId)
      .in("kind", ["cross_training_ack", "cross_training_substitution"])
      .limit(1),
    admin
      .from("activities")
      .select(
        "start_date_local, name, activity_type, distance_m, moving_time_s, avg_pace_s_per_km, avg_hr",
      )
      .eq("athlete_id", athleteId)
      .neq("id", activityId)
      .gte("start_date_local", arcStart)
      .lte("start_date_local", activity.date)
      .order("start_date_local", { ascending: false })
      .limit(30),
  ]);

  const memRows = ((memRes.data ?? []) as MemoryRow[]).map((m) => ({
    kind: m.kind,
    content: m.content,
    tags: m.tags ?? [],
    createdAt: m.created_at,
  }));

  const injuries = memRows.filter((m) => m.kind === "injury");
  const lifeContext = memRows.filter(
    (m) => m.kind === "context" && m.createdAt >= lifeStart,
  );

  type RecentRunRow = {
    start_date_local: string;
    name: string | null;
    activity_type: string | null;
    distance_m: number | null;
    moving_time_s: number | null;
    avg_pace_s_per_km: number | null;
    avg_hr: number | null;
  };

  const recentRuns: CrossTrainingArcRun[] = ((recentRunsRes.data ?? []) as RecentRunRow[])
    .filter((r) => classifyActivityType(r.activity_type) === "run")
    .slice(0, 10)
    .map((r) => ({
      date: r.start_date_local,
      name: r.name,
      distanceKm: Number(((r.distance_m ?? 0) / 1000).toFixed(2)),
      paceSPerKm: r.avg_pace_s_per_km ?? paceSPerKm(r.distance_m, r.moving_time_s),
      avgHr: r.avg_hr,
    }));

  return {
    athleteId,
    displayName,
    timezone: tz,
    activity,
    pattern,
    injuries,
    lifeContext,
    recentRuns,
    activePlanText: (planRes.data?.raw_text as string | null) ?? null,
    isFirstCrossTrainingAck: (priorAckRes.data ?? []).length === 0,
  };
}
