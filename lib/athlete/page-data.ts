/**
 * Read-only queries that power the athlete page.
 *
 * Everything here is shaped to a "what Casey knows about you" frame 
 * memory-as-progress counts, the rolling mileage prose, niggles + life
 * context Casey is holding. No editor mutations live here yet; those
 * arrive in a follow-up PR.
 */

import { createAdminClient } from "@/lib/supabase/server";
import {
  classifyActivityType,
  CROSS_TRAINING_TYPES,
} from "@/lib/strava/activity-types";
import { backfillStravaProfile } from "@/lib/athlete/profile-sync";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AthleteProfile = {
  id: string;
  email: string | null;
  displayName: string | null;
  timezone: string | null;
  units: "metric" | "imperial";
  dateOfBirth: string | null;
  weightKg: number | null;
  sex: string | null;
  /** 'coach' = human coach writes the training, 'self' = self-directed / public plan, null = unset. */
  coachingMode: "coach" | "self" | null;
};

export type GoalRace = {
  name: string | null;
  raceDate: string | null;
  goalTimeSeconds: number | null;
};

export type Niggle = {
  id: string;
  content: string;
  tags: string[];
  firstMentionedAt: string;
};

export type LifeContextItem = {
  id: string;
  content: string;
  tags: string[];
  recordedAt: string;
};

export type WeeklyTraining = {
  /** Rolling 4-week average of run distance, in metres. */
  fourWeekAvgRunMetres: number;
  /** Total run distance this calendar week so far, in metres. Week starts Monday. */
  thisWeekRunMetres: number;
  /** True when there's at least one run in the last 4 weeks; gates whether the section renders. */
  hasAnyRuns: boolean;
};

export type MemoryProgress = {
  runs: number;
  crossTraining: number;
  caseyMessages: number;
};

export type ActivePlan = {
  id: string;
  source: "text" | "image" | "pdf";
  sourceFilename: string | null;
  rawText: string;
  /** Whether the athlete reviewed an extraction. False for pasted plans. */
  confirmed: boolean;
  uploadedAt: string;
  /** Days since upload, rounded down. Drives the "your plan is N weeks old" copy. */
  ageDays: number;
};

export type AthletePageData = {
  profile: AthleteProfile;
  goalRace: GoalRace | null;
  weekly: WeeklyTraining;
  niggles: Niggle[];
  lifeContext: LifeContextItem[];
  memory: MemoryProgress;
  activePlan: ActivePlan | null;
};

type MemoryRow = {
  id: string;
  kind: string;
  content: string;
  tags: string[] | null;
  created_at: string;
};

type ActivityRow = {
  start_date_local: string;
  activity_type: string | null;
  distance_m: number | null;
};

/**
 * Compute the start of "this week" (Monday 00:00) in the athlete's local
 * timezone, expressed as a UTC ISO string the activities query can use.
 * Falls back to UTC when no timezone is captured, matches the rest of the
 * codebase's null-tz behaviour.
 */
function startOfThisWeekIso(tz: string | null): string {
  const now = new Date();
  if (!tz) {
    const utcDay = now.getUTCDay();
    const daysFromMonday = (utcDay + 6) % 7;
    const monday = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - daysFromMonday,
      ),
    );
    return monday.toISOString();
  }

  // Get the local date parts in the athlete's tz, then construct a UTC
  // anchor at local-midnight Monday.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  ) as { year: string; month: string; day: string; weekday: string };
  const dayShort = parts.weekday;
  const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    dayShort,
  );
  const daysFromMonday = ((dayIdx >= 0 ? dayIdx : now.getUTCDay()) + 6) % 7;
  const localMidnight = new Date(
    `${parts.year}-${parts.month}-${parts.day}T00:00:00Z`,
  );
  localMidnight.setUTCDate(localMidnight.getUTCDate() - daysFromMonday);
  return localMidnight.toISOString();
}

export async function loadAthletePageData(
  athleteId: string,
): Promise<AthletePageData> {
  const admin = createAdminClient();

  const fourWeeksAgo = new Date(Date.now() - 28 * DAY_MS).toISOString();

  const [
    athleteRes,
    preferencesRes,
    goalRes,
    activitiesRes,
    memoryRes,
    runsCountRes,
    xtCountRes,
    caseyCountRes,
    activePlanRes,
  ] = await Promise.all([
    admin
      .from("athletes")
      .select(
        "id, email, display_name, timezone, units, date_of_birth, weight_kg, sex",
      )
      .eq("id", athleteId)
      .single(),
    admin
      .from("preferences")
      .select("coaching_mode")
      .eq("athlete_id", athleteId)
      .maybeSingle(),
    admin
      .from("goal_races")
      .select("name, race_date, goal_time_seconds")
      .eq("athlete_id", athleteId)
      .eq("is_active", true)
      .order("race_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("activities")
      .select("start_date_local, activity_type, distance_m")
      .eq("athlete_id", athleteId)
      .gte("start_date_local", fourWeeksAgo)
      .order("start_date_local", { ascending: false }),
    admin
      .from("memory_items")
      .select("id, kind, content, tags, created_at")
      .eq("athlete_id", athleteId)
      .in("kind", ["injury", "context"])
      .order("created_at", { ascending: false }),
    admin
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", athleteId)
      .ilike("activity_type", "%run%"),
    // Head-only count of cross-training activities. The pre-V1 path pulled
    // every row's activity_type to filter in JS, which returned hundreds of
    // rows per render for power users. CROSS_TRAINING_TYPES is the exact
    // set classifyActivityType maps to "cross_training", so .in() is
    // equivalent to the previous filter and runs index-only.
    admin
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", athleteId)
      .in("activity_type", CROSS_TRAINING_TYPES as unknown as string[]),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", athleteId)
      .eq("kind", "chat_casey"),
    admin
      .from("training_plans")
      .select("id, source, source_filename, raw_text, confirmed_at, created_at")
      .eq("athlete_id", athleteId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (athleteRes.error || !athleteRes.data) {
    throw new Error(`athlete ${athleteId} not found`);
  }

  const a = athleteRes.data as {
    id: string;
    email: string | null;
    display_name: string | null;
    timezone: string | null;
    units: string;
    date_of_birth: string | null;
    weight_kg: number | null;
    sex: string | null;
  };

  // Self-heal Strava-sourced fields. Hot path is the snapshot bail in
  // backfillStravaProfile, zero queries when sex+weight are already
  // populated. Runs after the main read so we can reuse those values
  // and skip the legacy two-query existence check.
  await backfillStravaProfile(athleteId, {
    sex: a.sex,
    weight_kg: a.weight_kg,
  });
  const prefRow = preferencesRes.data as {
    coaching_mode: string | null;
  } | null;
  const coachingMode =
    prefRow?.coaching_mode === "coach" || prefRow?.coaching_mode === "self"
      ? prefRow.coaching_mode
      : null;

  const profile: AthleteProfile = {
    id: a.id,
    email: a.email,
    displayName: a.display_name,
    timezone: a.timezone,
    units: a.units === "imperial" ? "imperial" : "metric",
    dateOfBirth: a.date_of_birth,
    weightKg: a.weight_kg != null ? Number(a.weight_kg) : null,
    sex: a.sex,
    coachingMode,
  };

  const goalRow = goalRes.data as {
    name: string | null;
    race_date: string | null;
    goal_time_seconds: number | null;
  } | null;
  const goalRace: GoalRace | null = goalRow
    ? {
        name: goalRow.name,
        raceDate: goalRow.race_date,
        goalTimeSeconds: goalRow.goal_time_seconds,
      }
    : null;

  const activityRows = (activitiesRes.data ?? []) as ActivityRow[];
  const runRows = activityRows.filter(
    (r) => classifyActivityType(r.activity_type) === "run",
  );
  const fourWeekRunMetres = runRows.reduce(
    (sum, r) => sum + (r.distance_m ?? 0),
    0,
  );
  const thisWeekStart = startOfThisWeekIso(profile.timezone);
  const thisWeekRunMetres = runRows
    .filter((r) => r.start_date_local >= thisWeekStart)
    .reduce((sum, r) => sum + (r.distance_m ?? 0), 0);

  const weekly: WeeklyTraining = {
    fourWeekAvgRunMetres: fourWeekRunMetres / 4,
    thisWeekRunMetres,
    hasAnyRuns: runRows.length > 0,
  };

  const memoryRows = (memoryRes.data ?? []) as MemoryRow[];
  const niggles: Niggle[] = memoryRows
    .filter((m) => m.kind === "injury")
    .map((m) => ({
      id: m.id,
      content: m.content,
      tags: m.tags ?? [],
      firstMentionedAt: m.created_at,
    }));

  const fourteenDaysAgoIso = new Date(Date.now() - 14 * DAY_MS).toISOString();
  const lifeContext: LifeContextItem[] = memoryRows
    .filter((m) => m.kind === "context" && m.created_at >= fourteenDaysAgoIso)
    .map((m) => ({
      id: m.id,
      content: m.content,
      tags: m.tags ?? [],
      recordedAt: m.created_at,
    }));

  // Run count via ilike over activity_type covers Run / TrailRun / VirtualRun.
  // Cross-training count is a head-only .in() against CROSS_TRAINING_TYPES,
  // index-aligned with the data and never returns rows over the wire.
  const memory: MemoryProgress = {
    runs: runsCountRes.count ?? 0,
    crossTraining: xtCountRes.count ?? 0,
    caseyMessages: caseyCountRes.count ?? 0,
  };

  const planRow = activePlanRes.data as
    | {
        id: string;
        source: string | null;
        source_filename: string | null;
        raw_text: string | null;
        confirmed_at: string | null;
        created_at: string;
      }
    | null;

  let activePlan: ActivePlan | null = null;
  if (planRow && planRow.raw_text) {
    const sourceRaw = planRow.source ?? "text";
    const source: ActivePlan["source"] =
      sourceRaw === "pdf" || sourceRaw === "image" ? sourceRaw : "text";
    const ageDays = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(planRow.created_at).getTime()) / DAY_MS,
      ),
    );
    activePlan = {
      id: planRow.id,
      source,
      sourceFilename: planRow.source_filename,
      rawText: planRow.raw_text,
      confirmed: planRow.confirmed_at != null,
      uploadedAt: planRow.created_at,
      ageDays,
    };
  }

  return {
    profile,
    goalRace,
    weekly,
    niggles,
    lifeContext,
    memory,
    activePlan,
  };
}

// --- Display helpers --------------------------------------------------------

export function formatDistance(
  metres: number,
  units: "metric" | "imperial",
): string {
  if (units === "imperial") {
    const miles = metres / 1609.344;
    return `${miles.toFixed(1)} mi`;
  }
  const km = metres / 1000;
  return `${km.toFixed(1)} km`;
}

export function formatGoalTime(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export function formatSex(sex: string | null): string | null {
  if (!sex) return null;
  switch (sex.toUpperCase()) {
    case "M":
      return "Male";
    case "F":
      return "Female";
    case "X":
      return "Other";
    default:
      return sex;
  }
}

export function formatWeight(
  weightKg: number | null,
  units: "metric" | "imperial",
): string | null {
  if (weightKg == null) return null;
  if (units === "imperial") {
    const lbs = weightKg * 2.20462;
    return `${lbs.toFixed(0)} lb`;
  }
  return `${weightKg.toFixed(1)} kg`;
}

export function formatNiggleHeader(n: Niggle): string {
  if (n.tags.length === 0) return "Niggle";
  return n.tags
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(" / ");
}
