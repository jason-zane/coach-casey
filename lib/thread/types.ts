export type MessageKind =
  | "chat_user"
  | "chat_casey"
  | "debrief"
  | "weekly_review"
  | "follow_up"
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
