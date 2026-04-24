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
  await requireAthleteId();
  return loadOlderWindow(threadId, beforeIso, days);
}

export async function refreshThread(
  threadId: string,
  days = 14,
): Promise<{ messages: Message[]; hasMore: boolean; oldestLoaded: string | null }> {
  await requireAthleteId();
  return loadRecentWindow(threadId, days);
}

export async function fetchMessagesAroundDate(
  threadId: string,
  isoDate: string,
): Promise<Message[]> {
  await requireAthleteId();
  return loadAroundDate(threadId, isoDate, { daysBefore: 3, daysAfter: 3 });
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

export async function seedEmptyStateIfNeeded(threadId: string, athleteId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId);
  if ((count ?? 0) > 0) return;

  // Empty state draft per home-state working draft §3. Content voice pass
  // deferred to content skill.
  const { createAdminClient } = await import("@/lib/supabase/server");
  const admin = createAdminClient();
  await admin.from("messages").insert({
    thread_id: threadId,
    athlete_id: athleteId,
    kind: "chat_casey",
    body: "First run and I'll have something to say. Or say something now if you like.",
    meta: { seed: true },
  });
}
