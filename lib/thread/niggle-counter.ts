import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Niggle escalation gating helper.
 *
 * Counts mentions of a body part across recent memory_items
 * (kind='injury'), returns the recent mentions for the prompt, and
 * decides whether the count has crossed the escalation threshold (3
 * mentions in 14 days, v1 heuristic).
 *
 * Body-part normalisation is light: lowercase, strip side-prefixes
 * (left/right). "Left calf", "right calf", "calf tight" all roll up
 * to "calf".
 */

const WINDOW_DAYS = 14;
const ESCALATION_THRESHOLD = 3;

/**
 * Normalise a niggle body-part tag. Light enough to roll up common
 * variants without invent-merging unrelated items.
 */
export function normaliseBodyPart(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (!lower) return null;
  const stripped = lower
    .replace(/^(left|right)\s+/, "")
    .replace(/[^a-z\s]/g, "")
    .trim();
  return stripped || null;
}

export type NiggleCount = {
  bodyPart: string;
  mentionsInWindow: number;
  recentMentions: string[];
};

/**
 * Count mentions for every body part and return only those that have
 * crossed the threshold. The caller fires the escalation surface for
 * each one (deduped against recent escalations by the action).
 */
export async function countNigglesOverThreshold(
  athleteId: string,
): Promise<NiggleCount[]> {
  const admin = createAdminClient();
  const cutoff = new Date(
    Date.now() - WINDOW_DAYS * 86400_000,
  ).toISOString();

  const { data: items } = await admin
    .from("memory_items")
    .select("content, tags, created_at")
    .eq("athlete_id", athleteId)
    .eq("kind", "injury")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  type Row = { content: string; tags: string[]; created_at: string };
  const rows = ((items ?? []) as Row[]) ?? [];

  const byPart = new Map<string, Row[]>();
  for (const r of rows) {
    const candidates = r.tags && r.tags.length > 0 ? r.tags : [r.content];
    for (const c of candidates) {
      const part = normaliseBodyPart(c);
      if (!part) continue;
      const list = byPart.get(part) ?? [];
      list.push(r);
      byPart.set(part, list);
    }
  }

  const over: NiggleCount[] = [];
  for (const [bodyPart, rs] of byPart) {
    if (rs.length < ESCALATION_THRESHOLD) continue;
    over.push({
      bodyPart,
      mentionsInWindow: rs.length,
      recentMentions: rs.slice(0, 5).map((r) => r.content),
    });
  }
  return over;
}

/**
 * Whether the athlete has crossed the threshold for any body part.
 * Used by the niggle-insert hooks to decide whether to invoke the
 * escalation action.
 */
export async function maybeFireNiggleEscalation(
  athleteId: string,
): Promise<void> {
  const over = await countNigglesOverThreshold(athleteId);
  if (over.length === 0) return;

  // Read coach status once.
  const admin = createAdminClient();
  const { data: prefs } = await admin
    .from("preferences")
    .select("coaching_mode")
    .eq("athlete_id", athleteId)
    .maybeSingle();
  const hasCoach =
    (prefs as { coaching_mode?: "coach" | "self" | null } | null)
      ?.coaching_mode === "coach";

  // Read display name for voice-check / observability.
  const { data: athlete } = await admin
    .from("athletes")
    .select("display_name")
    .eq("id", athleteId)
    .maybeSingle();
  const displayName =
    (athlete as { display_name: string | null } | null)?.display_name ?? null;

  const { fireNiggleEscalation } = await import(
    "@/app/actions/proactive-surfaces"
  );
  for (const pattern of over) {
    try {
      await fireNiggleEscalation({
        athleteId,
        displayName,
        bodyPart: pattern.bodyPart,
        mentionsInWindow: pattern.mentionsInWindow,
        windowDays: WINDOW_DAYS,
        recentMentions: pattern.recentMentions,
        hasCoach,
      });
    } catch (err) {
      console.warn("niggle escalation fanout failed", err);
    }
  }
}
