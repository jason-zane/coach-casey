import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type CoachMessageSender = "coach" | "athlete";

export type CoachMessage = {
  id: string;
  sender: CoachMessageSender;
  body: string;
  createdAt: string;
  readAt: string | null;
};

type Row = {
  id: string;
  athlete_id: string;
  sender: CoachMessageSender;
  body: string;
  created_at: string;
  read_at: string | null;
};

function toMessage(r: Row): CoachMessage {
  return {
    id: r.id,
    sender: r.sender,
    body: r.body,
    createdAt: r.created_at,
    readAt: r.read_at,
  };
}

/** The full coach<->athlete conversation, oldest first. Service-role read; the
 * caller is responsible for the ownership/admin check. */
export async function getConversation(
  athleteId: string,
): Promise<CoachMessage[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("coach_messages")
      .select("id, athlete_id, sender, body, created_at, read_at")
      .eq("athlete_id", athleteId)
      .order("created_at", { ascending: true })
      .limit(1000);
    return ((data ?? []) as Row[]).map(toMessage);
  } catch {
    return [];
  }
}

/**
 * Mark the messages the reader receives as read. When the athlete opens the
 * conversation, coach messages become read; when the coach opens it, the
 * athlete's messages become read. Best-effort.
 */
export async function markRead(
  athleteId: string,
  reader: CoachMessageSender,
): Promise<void> {
  const incomingSender: CoachMessageSender =
    reader === "athlete" ? "coach" : "athlete";
  try {
    const admin = createAdminClient();
    await admin
      .from("coach_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("athlete_id", athleteId)
      .eq("sender", incomingSender)
      .is("read_at", null);
  } catch {
    /* non-fatal: unread badges are cosmetic */
  }
}

export type Conversation = {
  athleteId: string;
  name: string | null;
  email: string;
  lastBody: string;
  lastSender: CoachMessageSender;
  lastAt: string;
  /** Athlete replies the coach hasn't read yet. */
  unread: number;
};

/**
 * Admin inbox: one entry per athlete who has any coach messages, newest
 * activity first, with the unread (athlete-sent, coach-unread) count. Small
 * scale, so it groups in memory rather than in SQL.
 */
export async function listConversations(): Promise<Conversation[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("coach_messages")
      .select("athlete_id, sender, body, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(2000);
    const rows = (data ?? []) as Omit<Row, "id">[];
    if (rows.length === 0) return [];

    const byAthlete = new Map<
      string,
      { last: Omit<Row, "id">; unread: number }
    >();
    for (const r of rows) {
      const cur = byAthlete.get(r.athlete_id);
      if (!cur) {
        byAthlete.set(r.athlete_id, { last: r, unread: 0 });
      }
      const entry = byAthlete.get(r.athlete_id)!;
      // rows are newest-first, so the first seen is the latest
      if (r.sender === "athlete" && r.read_at === null) entry.unread += 1;
    }

    const ids = [...byAthlete.keys()];
    const { data: athletes } = await admin
      .from("athletes")
      .select("id, display_name, email")
      .in("id", ids);
    const meta = new Map(
      ((athletes ?? []) as {
        id: string;
        display_name: string | null;
        email: string;
      }[]).map((a) => [a.id, a]),
    );

    return [...byAthlete.entries()]
      .map(([athleteId, { last, unread }]) => ({
        athleteId,
        name: meta.get(athleteId)?.display_name ?? null,
        email: meta.get(athleteId)?.email ?? "(unknown)",
        lastBody: last.body,
        lastSender: last.sender,
        lastAt: last.created_at,
        unread,
      }))
      .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  } catch {
    return [];
  }
}

/** Coach messages the athlete hasn't read yet (for the in-app badge). */
export async function countUnreadForAthlete(
  athleteId: string,
): Promise<number> {
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("coach_messages")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", athleteId)
      .eq("sender", "coach")
      .is("read_at", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Athlete replies the coach hasn't read yet, across everyone (admin badge). */
export async function countAdminUnread(): Promise<number> {
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("coach_messages")
      .select("id", { count: "exact", head: true })
      .eq("sender", "athlete")
      .is("read_at", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Real (non-test) athletes a broadcast would reach. */
export async function broadcastTargetIds(): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("athletes")
      .select("id, is_test_user")
      .is("deleted_at", null);
    return ((data ?? []) as { id: string; is_test_user: boolean | null }[])
      .filter((a) => !a.is_test_user)
      .map((a) => a.id);
  } catch {
    return [];
  }
}

/** Name + email for one athlete, for the admin conversation header. */
export async function getAthleteBrief(
  athleteId: string,
): Promise<{ name: string | null; email: string } | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("athletes")
      .select("display_name, email")
      .eq("id", athleteId)
      .maybeSingle<{ display_name: string | null; email: string }>();
    if (!data) return null;
    return { name: data.display_name, email: data.email };
  } catch {
    return null;
  }
}
