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
