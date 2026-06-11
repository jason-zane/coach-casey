/**
 * Read-only queries that power the athlete page.
 *
 * Everything here is shaped to a "what Casey knows about you" frame 
 * memory-as-progress counts, the rolling mileage prose, niggles + life
 * context Casey is holding. No editor mutations live here yet; those
 * arrive in a follow-up PR.
 */

import { cache } from "react";
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
  /** Race tier added in the 2026-05-16 Casey refresh. */
  tier: "A" | "B" | "C" | null;
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

/**
 * Per-section loaders. The athlete page Suspense-streams each section
 * independently so the editorial chrome lands instantly and individual
 * sections fill in as their queries resolve. Power users with hundreds
 * of activity rows used to make every athlete-page render wait on the
 * full activities scan, now the You / Goals / Memory sections show
 * before that finishes.
 */

export const loadAthleteProfile = cache(_loadAthleteProfile);

async function _loadAthleteProfile(
  athleteId: string,
): Promise<AthleteProfile> {
  const admin = createAdminClient();
  const [{ data: athleteRow, error }, { data: prefRow }] = await Promise.all([
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
      .maybeSingle<{ coaching_mode: string | null }>(),
  ]);

  if (error || !athleteRow) {
    throw new Error(`athlete ${athleteId} not found`);
  }

  const a = athleteRow as {
    id: string;
    email: string | null;
    display_name: string | null;
    timezone: string | null;
    units: string;
    date_of_birth: string | null;
    weight_kg: number | null;
    sex: string | null;
  };

  // Self-heal Strava-sourced fields. The snapshot keeps backfill in its
  // zero-query bail when sex+weight are already populated, so this stays
  // cheap on the steady-state hot path. Runs in the You section so other
  // sections aren't blocked on it.
  await backfillStravaProfile(athleteId, {
    sex: a.sex,
    weight_kg: a.weight_kg,
  });

  const coachingMode =
    prefRow?.coaching_mode === "coach" || prefRow?.coaching_mode === "self"
      ? prefRow.coaching_mode
      : null;

  return {
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
}

export async function loadGoalRace(
  athleteId: string,
): Promise<GoalRace | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("goal_races")
    .select("name, race_date, goal_time_seconds, tier")
    .eq("athlete_id", athleteId)
    .eq("is_active", true)
    .order("race_date", { ascending: true })
    .limit(1)
    .maybeSingle<{
      name: string | null;
      race_date: string | null;
      goal_time_seconds: number | null;
      tier: "A" | "B" | "C" | null;
    }>();
  if (!data) return null;
  return {
    name: data.name,
    raceDate: data.race_date,
    goalTimeSeconds: data.goal_time_seconds,
    tier: data.tier,
  };
}

export async function loadActivePlan(
  athleteId: string,
): Promise<ActivePlan | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("training_plans")
    .select("id, source, source_filename, raw_text, confirmed_at, created_at")
    .eq("athlete_id", athleteId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      source: string | null;
      source_filename: string | null;
      raw_text: string | null;
      confirmed_at: string | null;
      created_at: string;
    }>();
  if (!data || !data.raw_text) return null;
  const sourceRaw = data.source ?? "text";
  const source: ActivePlan["source"] =
    sourceRaw === "pdf" || sourceRaw === "image" ? sourceRaw : "text";
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(data.created_at).getTime()) / DAY_MS),
  );
  return {
    id: data.id,
    source,
    sourceFilename: data.source_filename,
    rawText: data.raw_text,
    confirmed: data.confirmed_at != null,
    uploadedAt: data.created_at,
    ageDays,
  };
}

export async function loadWeeklyTraining(
  athleteId: string,
  timezone: string | null,
): Promise<WeeklyTraining> {
  const admin = createAdminClient();
  const fourWeeksAgo = new Date(Date.now() - 28 * DAY_MS).toISOString();
  const { data } = await admin
    .from("activities")
    .select("start_date_local, activity_type, distance_m")
    .eq("athlete_id", athleteId)
    .gte("start_date_local", fourWeeksAgo)
    .order("start_date_local", { ascending: false });
  const rows = (data ?? []) as ActivityRow[];
  const runRows = rows.filter(
    (r) => classifyActivityType(r.activity_type) === "run",
  );
  const fourWeekRunMetres = runRows.reduce(
    (sum, r) => sum + (r.distance_m ?? 0),
    0,
  );
  const thisWeekStart = startOfThisWeekIso(timezone);
  const thisWeekRunMetres = runRows
    .filter((r) => r.start_date_local >= thisWeekStart)
    .reduce((sum, r) => sum + (r.distance_m ?? 0), 0);
  return {
    fourWeekAvgRunMetres: fourWeekRunMetres / 4,
    thisWeekRunMetres,
    hasAnyRuns: runRows.length > 0,
  };
}

export type TrackingItems = {
  niggles: Niggle[];
  lifeContext: LifeContextItem[];
};

export async function loadTrackingItems(
  athleteId: string,
): Promise<TrackingItems> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("memory_items")
    .select("id, kind, content, tags, created_at")
    .eq("athlete_id", athleteId)
    .in("kind", ["injury", "context"])
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as MemoryRow[];
  const niggles: Niggle[] = rows
    .filter((m) => m.kind === "injury")
    .map((m) => ({
      id: m.id,
      content: m.content,
      tags: m.tags ?? [],
      firstMentionedAt: m.created_at,
    }));
  const fourteenDaysAgoIso = new Date(Date.now() - 14 * DAY_MS).toISOString();
  const lifeContext: LifeContextItem[] = rows
    .filter((m) => m.kind === "context" && m.created_at >= fourteenDaysAgoIso)
    .map((m) => ({
      id: m.id,
      content: m.content,
      tags: m.tags ?? [],
      recordedAt: m.created_at,
    }));
  return { niggles, lifeContext };
}

export async function loadMemoryProgress(
  athleteId: string,
): Promise<MemoryProgress> {
  const admin = createAdminClient();
  const [runsRes, xtRes, caseyRes] = await Promise.all([
    admin
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", athleteId)
      .ilike("activity_type", "%run%"),
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
  ]);
  return {
    runs: runsRes.count ?? 0,
    crossTraining: xtRes.count ?? 0,
    caseyMessages: caseyRes.count ?? 0,
  };
}

export type StravaConnectionInfo = {
  connectedAt: string | null;
  scope: string | null;
  isMock: boolean;
  isConnected: boolean;
};

export async function loadStravaConnection(
  athleteId: string,
): Promise<StravaConnectionInfo> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("strava_connections")
    .select("connected_at, scope, is_mock")
    .eq("athlete_id", athleteId)
    .maybeSingle<{
      connected_at: string | null;
      scope: string | null;
      is_mock: boolean | null;
    }>();
  return {
    connectedAt: data?.connected_at ?? null,
    scope: data?.scope ?? null,
    isMock: data?.is_mock ?? false,
    isConnected: Boolean(data),
  };
}

/**
 * Whether Casey appends the public verdict line to the athlete's Strava
 * activity descriptions. Default false (opt-in); the missing-row and
 * missing-column cases both read as off.
 */
export async function loadStravaBlurbEnabled(
  athleteId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("preferences")
    .select("strava_blurb_enabled")
    .eq("athlete_id", athleteId)
    .maybeSingle<{ strava_blurb_enabled: boolean | null }>();
  return data?.strava_blurb_enabled ?? false;
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
