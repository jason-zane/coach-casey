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
 * messages, used to render the "View on Strava" attribution link required
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

/**
 * Activity stats mirrored onto debrief and cross-training messages so the
 * thread renderer can show a consistent stat row (distance · time · pace ·
 * HR) without re-querying activities on every render. All fields are
 * optional, the renderer omits anything missing, which also means messages
 * created before this metadata was added still render cleanly.
 */
export type MessageActivityStats = {
  activityType: string | null;
  distanceKm: number | null;
  movingTimeS: number | null;
  avgHr: number | null;
};

function numberOrNull(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return null;
}

export function getMessageActivityStats(message: Message): MessageActivityStats | null {
  const kinds: MessageKind[] = [
    "debrief",
    "cross_training_ack",
    "cross_training_substitution",
  ];
  if (!kinds.includes(message.kind)) return null;
  const m = message.meta as {
    activity_type?: unknown;
    distance_km?: unknown;
    moving_time_s?: unknown;
    avg_hr?: unknown;
  };
  return {
    activityType: typeof m.activity_type === "string" ? m.activity_type : null,
    distanceKm: numberOrNull(m.distance_km),
    movingTimeS: numberOrNull(m.moving_time_s),
    avgHr: numberOrNull(m.avg_hr),
  };
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
