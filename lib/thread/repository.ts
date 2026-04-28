import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { loadDebriefRpeMetaBatch } from "@/lib/rpe/repository";
import type { Message, MessageKind, Thread } from "./types";

const MESSAGE_COLUMNS =
  "id, thread_id, athlete_id, kind, body, meta, created_at";

/**
 * Attach RPE state to debrief messages so the client can render the
 * picker without an extra round-trip per message. No-op when no
 * debriefs are present.
 */
async function enrichDebriefRpe(
  athleteId: string,
  messages: Message[],
): Promise<Message[]> {
  const debriefActivityIds: string[] = [];
  for (const m of messages) {
    if (m.kind !== "debrief") continue;
    const id = (m.meta as { activity_id?: unknown }).activity_id;
    if (typeof id === "string") debriefActivityIds.push(id);
  }
  if (debriefActivityIds.length === 0) return messages;

  const meta = await loadDebriefRpeMetaBatch(athleteId, debriefActivityIds);
  return messages.map((m) => {
    if (m.kind !== "debrief") return m;
    const aid = (m.meta as { activity_id?: unknown }).activity_id;
    if (typeof aid !== "string") return m;
    const rpe = meta.get(aid);
    if (!rpe) return m;
    return { ...m, meta: { ...m.meta, rpe } };
  });
}

/**
 * Idempotent, uses ensure_thread() SQL helper which upserts on the unique
 * (athlete_id) constraint.
 */
export async function ensureThread(athleteId: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("ensure_thread", {
    p_athlete_id: athleteId,
  });
  if (error) throw error;
  return data as string;
}

export async function loadThread(
  athleteId: string,
): Promise<Thread | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("threads")
    .select("id, athlete_id, last_viewed_at, created_at")
    .eq("athlete_id", athleteId)
    .maybeSingle();
  return (data as Thread | null) ?? null;
}

/**
 * Rolling-window pagination by day count (not message count), quiet stretches
 * don't load disproportionate date ranges, busy stretches don't overload.
 * Returns oldest-first for straightforward rendering top-to-bottom.
 */
async function loadWindow(
  client: SupabaseClient,
  threadId: string,
  {
    beforeIso,
    days,
  }: { beforeIso: string | null; days: number },
): Promise<{ messages: Message[]; hasMore: boolean; oldestLoaded: string | null }> {
  const end = beforeIso ? new Date(beforeIso) : new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  let query = client
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("thread_id", threadId)
    .gte("created_at", start.toISOString())
    .order("created_at", { ascending: true });

  if (beforeIso) query = query.lt("created_at", beforeIso);

  const { data, error } = await query;
  if (error) throw error;

  const messages = (data ?? []) as Message[];

  // hasMore detection: is there at least one message older than `start`?
  const { count } = await client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .lt("created_at", start.toISOString());

  // When the window is empty but the thread has older history, advance the
  // cursor to the window's start so the next paginate call continues from
  // there rather than stalling on a null cursor.
  const hasMore = (count ?? 0) > 0;
  const oldestLoaded =
    messages.length > 0
      ? messages[0].created_at
      : hasMore
        ? start.toISOString()
        : null;

  return { messages, hasMore, oldestLoaded };
}

export async function loadRecentWindow(
  threadId: string,
  athleteId: string,
  days = 14,
): Promise<{ messages: Message[]; hasMore: boolean; oldestLoaded: string | null }> {
  const supabase = await createClient();
  const window = await loadWindow(supabase, threadId, { beforeIso: null, days });
  const messages = await enrichDebriefRpe(athleteId, window.messages);
  return { ...window, messages };
}

export async function loadOlderWindow(
  threadId: string,
  athleteId: string,
  beforeIso: string,
  days = 14,
): Promise<{ messages: Message[]; hasMore: boolean; oldestLoaded: string | null }> {
  const supabase = await createClient();
  const window = await loadWindow(supabase, threadId, { beforeIso, days });
  const messages = await enrichDebriefRpe(athleteId, window.messages);
  return { ...window, messages };
}

/**
 * Load messages centred on a specific date, used by calendar jumps and search
 * result taps. Returns `daysBefore` + `daysAfter` of context around the target.
 */
export async function loadAroundDate(
  threadId: string,
  athleteId: string,
  isoDate: string,
  { daysBefore = 3, daysAfter = 3 }: { daysBefore?: number; daysAfter?: number } = {},
): Promise<Message[]> {
  const supabase = await createClient();
  const target = new Date(isoDate);
  const start = new Date(target.getTime() - daysBefore * 24 * 60 * 60 * 1000);
  const end = new Date(target.getTime() + (daysAfter + 1) * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("thread_id", threadId)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true });

  if (error) throw error;
  return enrichDebriefRpe(athleteId, (data ?? []) as Message[]);
}

export async function appendAthleteMessage(
  threadId: string,
  athleteId: string,
  body: string,
): Promise<Message> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("messages")
    .insert({
      thread_id: threadId,
      athlete_id: athleteId,
      kind: "chat_user" satisfies MessageKind,
      body,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw error;
  return data as Message;
}

export async function appendCaseyMessage(
  threadId: string,
  athleteId: string,
  kind: Exclude<MessageKind, "chat_user">,
  body: string,
  meta: Record<string, unknown> = {},
): Promise<Message> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("messages")
    .insert({ thread_id: threadId, athlete_id: athleteId, kind, body, meta })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw error;
  return data as Message;
}

export async function markThreadViewed(threadId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("threads")
    .update({ last_viewed_at: new Date().toISOString() })
    .eq("id", threadId);
}

export async function countUnread(
  threadId: string,
  lastViewedAt: string | null,
): Promise<number> {
  const supabase = await createClient();
  let query = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .neq("kind", "chat_user");
  if (lastViewedAt) query = query.gt("created_at", lastViewedAt);

  const { count } = await query;
  return count ?? 0;
}
