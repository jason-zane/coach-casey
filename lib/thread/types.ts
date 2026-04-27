export type MessageKind =
  | "chat_user"
  | "chat_casey"
  | "debrief"
  | "weekly_review"
  | "follow_up"
  | "cross_training_ack"
  | "cross_training_substitution"
  | "system";

export type Message = {
  id: string;
  thread_id: string;
  athlete_id: string;
  kind: MessageKind;
  body: string;
  meta: Record<string, unknown>;
  created_at: string;
};

/**
 * Convenience accessors for the RPE meta block that the debrief
 * enrichment step attaches to debrief messages. Centralised so the
 * client doesn't shape-check the meta object inline at every render
 * site.
 */
import type { DebriefRpeMeta } from "@/lib/rpe/types";
export function getDebriefRpe(message: Message): DebriefRpeMeta | null {
  if (message.kind !== "debrief") return null;
  const rpe = (message.meta as { rpe?: DebriefRpeMeta }).rpe;
  return rpe ?? null;
}

export function getDebriefActivityId(message: Message): string | null {
  if (message.kind !== "debrief") return null;
  const id = (message.meta as { activity_id?: unknown }).activity_id;
  return typeof id === "string" ? id : null;
}

/**
 * Strava activity id (the bigint primary key Strava uses in URLs), pulled
 * from the message's meta block. Present on debrief and cross-training
 * messages — used to render the "View on Strava" attribution link required
 * by Strava's brand guidelines for any UI displaying activity-derived data.
 */
export function getMessageStravaId(message: Message): number | null {
  const kinds: MessageKind[] = [
    "debrief",
    "cross_training_ack",
    "cross_training_substitution",
  ];
  if (!kinds.includes(message.kind)) return null;
  const raw = (message.meta as { strava_id?: unknown }).strava_id;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw)) return Number(raw);
  return null;
}

export type Thread = {
  id: string;
  athlete_id: string;
  last_viewed_at: string | null;
  created_at: string;
};

export type WindowCursor = {
  before: string | null;
  hasMore: boolean;
};
