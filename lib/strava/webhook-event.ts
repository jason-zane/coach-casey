import { timingSafeEqual } from "node:crypto";

export type StravaWebhookEvent = {
  aspect_type: "create" | "update" | "delete";
  event_time: number;
  object_id: number;
  object_type: "activity" | "athlete";
  owner_id: number;
  subscription_id: number;
  updates?: Record<string, unknown>;
};

export type WebhookCheck =
  | { ok: true }
  | { ok: false; status: number; error: string };

export const EVENT_SECRET_HEADER = "x-coach-casey-webhook-secret";

const ASPECT_TYPES = new Set(["create", "update", "delete"]);
const OBJECT_TYPES = new Set(["activity", "athlete"]);

export function liveWebhookSecurityRequired(
  env: Partial<Record<string, string | undefined>> = process.env,
): boolean {
  return env.NODE_ENV === "production" || env.STRAVA_MODE === "live";
}

export function authorizeWebhookSecret({
  expected,
  provided,
  required,
}: {
  expected: string | undefined;
  provided: string | null;
  required: boolean;
}): WebhookCheck {
  if (!expected) {
    if (required) {
      return {
        ok: false,
        status: 500,
        error: "STRAVA_WEBHOOK_EVENT_SECRET not configured",
      };
    }
    return { ok: true };
  }

  if (!constantTimeEqual(provided ?? "", expected)) {
    return { ok: false, status: 401, error: "unauthorized webhook event" };
  }
  return { ok: true };
}

export function authorizeWebhookSubscription(
  event: StravaWebhookEvent,
  expected: string | undefined,
  required: boolean,
): WebhookCheck {
  if (!expected) {
    if (required) {
      return {
        ok: false,
        status: 500,
        error: "STRAVA_WEBHOOK_SUBSCRIPTION_ID not configured",
      };
    }
    return { ok: true };
  }

  if (String(event.subscription_id) !== expected) {
    return { ok: false, status: 401, error: "unexpected webhook subscription" };
  }
  return { ok: true };
}

export function parseStravaWebhookEvent(raw: unknown): StravaWebhookEvent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const event = raw as Record<string, unknown>;

  if (typeof event.aspect_type !== "string" || !ASPECT_TYPES.has(event.aspect_type)) {
    return null;
  }
  if (typeof event.object_type !== "string" || !OBJECT_TYPES.has(event.object_type)) {
    return null;
  }
  if (!isSafePositiveInteger(event.object_id)) return null;
  if (!isSafePositiveInteger(event.owner_id)) return null;
  if (!isSafePositiveInteger(event.subscription_id)) return null;
  if (!isSafePositiveInteger(event.event_time)) return null;
  if (
    event.updates != null &&
    (typeof event.updates !== "object" || Array.isArray(event.updates))
  ) {
    return null;
  }

  return {
    aspect_type: event.aspect_type as StravaWebhookEvent["aspect_type"],
    object_type: event.object_type as StravaWebhookEvent["object_type"],
    object_id: event.object_id,
    owner_id: event.owner_id,
    subscription_id: event.subscription_id,
    event_time: event.event_time,
    updates: event.updates as Record<string, unknown> | undefined,
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
