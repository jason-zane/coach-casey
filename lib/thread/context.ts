import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { summariseActivity, type ChatContext } from "@/lib/llm/chat";
import type { Message } from "./types";

/**
 * Assemble the chat context for a single turn: athlete profile, recent
 * messages, recent activities, active memory items, active plan, goal races.
 *
 * Uses the admin client — tools and repository already gate by athleteId,
 * and the service role avoids an extra round-trip through RLS.
 */
export async function buildChatContext(
  athleteId: string,
  threadId: string,
  {
    historyTurns = 30,
    activityCount = 14,
  }: { historyTurns?: number; activityCount?: number } = {},
): Promise<ChatContext> {
  const admin = createAdminClient();

  const [athleteRes, historyRes, activitiesRes, memoryRes, planRes, racesRes] =
    await Promise.all([
      admin.from("athletes").select("id, display_name").eq("id", athleteId).single(),
      admin
        .from("messages")
        .select("id, thread_id, athlete_id, kind, body, meta, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(historyTurns),
      admin
        .from("activities")
        .select("start_date_local, name, distance_m, avg_pace_s_per_km, avg_hr")
        .eq("athlete_id", athleteId)
        .order("start_date_local", { ascending: false })
        .limit(activityCount),
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

  const activityRows = (activitiesRes.data ?? []).reverse();
  const recentActivities = activityRows.map(summariseActivity);

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

  return {
    athleteId,
    displayName: (athleteRes.data?.display_name as string | null) ?? null,
    recentMessages,
    recentActivities,
    memoryItems,
    activePlanText: (planRes.data?.raw_text as string | null) ?? null,
    goalRaces,
  };
}
