import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { summariseActivity, type ChatContext } from "@/lib/llm/chat";
import { classifyActivityType } from "@/lib/strava/activity-types";
import { extractWorkoutType } from "@/lib/strava/ingest";
import { classifyWorkout } from "@/lib/strava/workout-detect";
import type { StravaLap } from "@/lib/strava/client";
import { ageOnDate } from "./debrief-context";
import type { Message } from "./types";

/**
 * Assemble the chat context for a single turn: athlete profile, recent
 * messages, recent activities, active memory items, active plan, goal races.
 *
 * Uses the admin client — tools and repository already gate by athleteId,
 * and the service role avoids an extra round-trip through RLS.
 *
 * Activity window covers the full 12-week ingest window so the athlete can
 * ask about specific laps or sessions from any point in the picture.
 * Per-activity rendering then varies — workouts get lap detail inlined,
 * easy/long runs and cross-training stay one-liners.
 */
const DEFAULT_ACTIVITY_WEEKS = 12;

export async function buildChatContext(
  athleteId: string,
  threadId: string,
  {
    historyTurns = 30,
    activityWeeks = DEFAULT_ACTIVITY_WEEKS,
  }: { historyTurns?: number; activityWeeks?: number } = {},
): Promise<ChatContext> {
  const admin = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - activityWeeks * 7);

  const [athleteRes, historyRes, activitiesRes, memoryRes, planRes, racesRes] =
    await Promise.all([
      admin
        .from("athletes")
        .select("id, display_name, sex, weight_kg, date_of_birth")
        .eq("id", athleteId)
        .single(),
      admin
        .from("messages")
        .select("id, thread_id, athlete_id, kind, body, meta, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(historyTurns),
      admin
        .from("activities")
        .select(
          "start_date_local, name, activity_type, distance_m, moving_time_s, avg_pace_s_per_km, avg_hr, max_hr, elevation_gain_m, laps, raw",
        )
        .eq("athlete_id", athleteId)
        .gte("start_date_local", since.toISOString())
        .order("start_date_local", { ascending: false }),
      admin
        .from("memory_items")
        .select("kind, content, tags")
        .eq("athlete_id", athleteId)
        .order("created_at", { ascending: false })
        .limit(50),
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
        .select("name, race_date, goal_time_seconds, is_active")
        .eq("athlete_id", athleteId)
        .eq("is_active", true)
        .order("race_date", { ascending: true }),
    ]);

  const historyRows = (historyRes.data ?? []) as Message[];
  const recentMessages = [...historyRows].reverse();

  type ActivityRow = {
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
    raw: unknown;
  };

  const activityRows = ((activitiesRes.data ?? []) as ActivityRow[])
    .slice()
    .reverse(); // chronological for the prompt

  const recentActivities: ChatContext["recentActivities"] = [];
  const recentCrossTraining: ChatContext["recentCrossTraining"] = [];

  for (const row of activityRows) {
    const cls = classifyActivityType(row.activity_type);
    if (cls === "ambient") continue;

    if (cls === "run") {
      const laps = Array.isArray(row.laps) ? (row.laps as StravaLap[]) : null;
      const classification = classifyWorkout({
        laps,
        avgPaceSPerKm: row.avg_pace_s_per_km,
        distanceM: row.distance_m,
        movingTimeS: row.moving_time_s,
        stravaWorkoutType: extractWorkoutType(row.raw),
      });
      recentActivities.push(summariseActivity(row, classification));
    } else {
      // cross_training or catch_all
      recentCrossTraining.push({
        date: row.start_date_local.slice(0, 10),
        activityType: row.activity_type,
        name: row.name,
        durationMinutes:
          row.moving_time_s != null
            ? Math.round(row.moving_time_s / 60)
            : null,
        distanceKm:
          row.distance_m != null ? Number((row.distance_m / 1000).toFixed(2)) : null,
        avgHr: row.avg_hr,
      });
    }
  }

  const memoryItems = ((memoryRes.data ?? []) as {
    kind: string;
    content: string;
    tags: string[] | null;
  }[]).map((m) => ({
    kind: m.kind,
    content: m.content,
    tags: m.tags ?? [],
  }));

  const goalRaces = ((racesRes.data ?? []) as {
    name: string | null;
    race_date: string | null;
    goal_time_seconds: number | null;
  }[]).map((r) => ({
    name: r.name,
    raceDate: r.race_date,
    goalTimeSeconds: r.goal_time_seconds,
  }));

  const dob = (athleteRes.data?.date_of_birth as string | null) ?? null;
  const todayIso = new Date().toISOString().slice(0, 10);
  // Strava's enum is M/F/X; coaching norms are only calibrated for the
  // binary split, so 'X' falls through to generic-norm prompt behaviour.
  const rawSex = (athleteRes.data?.sex as string | null)?.toUpperCase() ?? null;
  const rawWeight = athleteRes.data?.weight_kg as number | string | null;
  const weightKg =
    rawWeight == null
      ? null
      : typeof rawWeight === "number"
        ? rawWeight
        : Number(rawWeight) || null;

  return {
    athleteId,
    displayName: (athleteRes.data?.display_name as string | null) ?? null,
    sex: rawSex === "M" || rawSex === "F" ? rawSex : null,
    weightKg,
    ageYears: dob ? ageOnDate(dob, todayIso) : null,
    recentMessages,
    recentActivities,
    recentCrossTraining,
    memoryItems,
    activePlanText: (planRes.data?.raw_text as string | null) ?? null,
    goalRaces,
  };
}
