import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/server";
import { getVapidConfig } from "./keys";

let vapidConfigured = false;
function ensureWebPushConfigured(): boolean {
  if (vapidConfigured) return true;
  const cfg = getVapidConfig();
  if (!cfg) return false;
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  vapidConfigured = true;
  return true;
}

/**
 * Payload shape consumed by `public/sw.js`. Keep tight — push payloads have a
 * 4KB hard limit and Apple is stricter still. The service worker reads
 * `title`, `body`, `tag`, `url`, and `icon`; nothing else is rendered.
 */
export type PushPayload = {
  title: string;
  body: string;
  // Coalescing key. Multiple notifications with the same tag replace each
  // other instead of stacking — perfect for "new debrief" so a backlog
  // doesn't pile up if the user has been offline.
  tag?: string;
  // Path the SW navigates to on click. Must be same-origin.
  url?: string;
  icon?: string;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type SendResult = {
  attempted: number;
  delivered: number;
  pruned: number;
  errors: number;
};

/**
 * Best-effort push fanout. Loads all subscriptions for the athlete, sends in
 * parallel, prunes dead endpoints (404/410), records soft errors. Never
 * throws — callers (debrief generation) treat push as a side effect that
 * shouldn't block the primary path.
 */
export async function sendPushToAthlete(
  athleteId: string,
  payload: PushPayload,
): Promise<SendResult> {
  const result: SendResult = { attempted: 0, delivered: 0, pruned: 0, errors: 0 };

  if (!ensureWebPushConfigured()) {
    return result;
  }

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("athlete_id", athleteId);

  const rows = (subs ?? []) as SubscriptionRow[];
  result.attempted = rows.length;
  if (rows.length === 0) return result;

  const json = JSON.stringify(payload);

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          json,
          {
            // 24h is plenty for a debrief notification; if the device is
            // offline longer, opening the app shows the debrief anyway.
            TTL: 60 * 60 * 24,
            urgency: "normal",
          },
        );
        result.delivered += 1;
        await admin
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString(), last_error_at: null, last_error_code: null })
          .eq("id", row.id);
      } catch (err) {
        const status = errorStatus(err);
        if (status === 404 || status === 410) {
          // Endpoint is permanently gone — drop it.
          await admin.from("push_subscriptions").delete().eq("id", row.id);
          result.pruned += 1;
        } else {
          result.errors += 1;
          await admin
            .from("push_subscriptions")
            .update({
              last_error_at: new Date().toISOString(),
              last_error_code: status ?? -1,
            })
            .eq("id", row.id);
          // Logged but not thrown — push is best-effort.
          console.warn("push send failed", {
            id: row.id,
            status,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }),
  );

  return result;
}

function errorStatus(err: unknown): number | null {
  if (typeof err === "object" && err && "statusCode" in err) {
    const code = (err as { statusCode: unknown }).statusCode;
    return typeof code === "number" ? code : null;
  }
  return null;
}
