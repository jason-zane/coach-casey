"use server";

import { createClient } from "@/lib/supabase/server";
import {
  ensureThread,
  loadAroundDate,
  loadOlderWindow,
  loadRecentWindow,
  markThreadViewed as markViewedRepo,
} from "@/lib/thread/repository";
import { datesWithActivity } from "@/lib/thread/calendar";
import { searchThread as searchThreadRepo } from "@/lib/thread/search";
import type { Message } from "@/lib/thread/types";

async function requireAthleteId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete) throw new Error("no athlete");
  return athlete.id as string;
}

export async function fetchOlderMessages(
  threadId: string,
  beforeIso: string,
  days = 14,
): Promise<{ messages: Message[]; hasMore: boolean; oldestLoaded: string | null }> {
  const athleteId = await requireAthleteId();
  return loadOlderWindow(threadId, athleteId, beforeIso, days);
}

export async function refreshThread(
  threadId: string,
  days = 14,
): Promise<{ messages: Message[]; hasMore: boolean; oldestLoaded: string | null }> {
  const athleteId = await requireAthleteId();
  return loadRecentWindow(threadId, athleteId, days);
}

export async function fetchMessagesAroundDate(
  threadId: string,
  isoDate: string,
  { daysBefore = 3, daysAfter = 3 }: { daysBefore?: number; daysAfter?: number } = {},
): Promise<Message[]> {
  const athleteId = await requireAthleteId();
  return loadAroundDate(threadId, athleteId, isoDate, { daysBefore, daysAfter });
}

export async function fetchCalendarDates(
  threadId: string,
  year: number,
  month: number,
): Promise<string[]> {
  const athleteId = await requireAthleteId();
  const set = await datesWithActivity(threadId, athleteId, year, month);
  return [...set].sort();
}

export async function searchMessages(query: string) {
  const athleteId = await requireAthleteId();
  const supabase = await createClient();
  const { data: thread } = await supabase
    .from("threads")
    .select("id")
    .eq("athlete_id", athleteId)
    .maybeSingle();
  if (!thread) {
    await ensureThread(athleteId);
    return [];
  }
  return searchThreadRepo(thread.id as string, athleteId, query);
}

export async function markThreadViewed(threadId: string) {
  await requireAthleteId();
  await markViewedRepo(threadId);
}

function formatGoalTime(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatRaceDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

function joinWithCommasAnd(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

async function buildWelcomeBody(
  athleteId: string,
): Promise<string> {
  const supabase = await createClient();
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 12 * 7);

  const [{ count: runCount }, planRow, raceRow, injuryRow] = await Promise.all([
    supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", athleteId)
      .gte("start_date_local", twelveWeeksAgo.toISOString()),
    supabase
      .from("preferences")
      .select("plan_follower_status")
      .eq("athlete_id", athleteId)
      .maybeSingle(),
    supabase
      .from("goal_races")
      .select("name, race_date, goal_time_seconds")
      .eq("athlete_id", athleteId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("memory_items")
      .select("content, tags")
      .eq("athlete_id", athleteId)
      .eq("kind", "injury")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const planStatus = planRow.data?.plan_follower_status as
    | "following"
    | "deferred"
    | "none"
    | "unknown"
    | undefined;
  const race = raceRow.data;
  const injury = injuryRow.data;

  const parts: string[] = [];
  if ((runCount ?? 0) > 0) parts.push(`your last ${runCount} runs`);
  if (planStatus === "following") parts.push("the plan you shared");
  else if (planStatus === "deferred")
    parts.push("a placeholder where your plan goes");
  else if (planStatus === "none")
    parts.push("the note that you’re running without a structured plan");

  if (race) {
    const raceName = race.name ?? "your goal race";
    const when = formatRaceDate(race.race_date);
    const time = formatGoalTime(race.goal_time_seconds);
    const bits = [raceName];
    if (when) bits.push(`in ${when}`);
    if (time) bits.push(`aiming at ${time}`);
    parts.push(bits.join(" "));
  }

  if (injury) {
    const tag = injury.tags?.[0];
    parts.push(tag ? `the ${tag} you flagged` : "the niggle you mentioned");
  }

  const opening =
    parts.length === 0
      ? "Not much to read yet. That’s fine. The next run will be the first real signal."
      : `I’ve got ${joinWithCommasAnd(parts)}. Enough to start.`;

  return [
    opening,
    "Finish your next run and a debrief will land. Short. Specific. A weekly review arrives on Sundays. Message me any time.",
    "I don’t write training plans — that’s your coach or the plan you’re following. I interpret what’s happening inside it. Supplementary, not a replacement.",
  ].join("\n\n");
}

export async function seedEmptyStateIfNeeded(threadId: string, athleteId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId);
  if ((count ?? 0) > 0) return;

  // First-load welcome — folds the old onboarding "welcome" step into the
  // chat as Casey's opening message, personalized to whatever the athlete
  // told us during onboarding (runs, plan status, race, injury).
  const body = await buildWelcomeBody(athleteId);

  const { createAdminClient } = await import("@/lib/supabase/server");
  const admin = createAdminClient();
  await admin.from("messages").insert({
    thread_id: threadId,
    athlete_id: athleteId,
    kind: "chat_casey",
    body,
    meta: { seed: true, welcome: true },
  });
}
