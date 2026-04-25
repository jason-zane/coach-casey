"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";
import { getVapidConfig } from "@/lib/push/keys";
import { sendPushToAthlete, type PushPayload } from "@/lib/push/send";

/**
 * Shape the browser hands us via `JSON.parse(JSON.stringify(subscription))`.
 * Server actions can't accept the live `PushSubscription` object directly;
 * the client serialises before sending.
 */
type SerializedSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "invalid_subscription" | "no_athlete" };

/**
 * Persist a browser push subscription against the signed-in athlete and flip
 * the push_enabled preference. Idempotent — re-subscribing the same endpoint
 * (e.g. after browser cache clear) updates rather than duplicates.
 */
export async function subscribePush(
  sub: SerializedSubscription,
): Promise<SubscribeResult> {
  if (!getVapidConfig()) return { ok: false, reason: "not_configured" };
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { ok: false, reason: "invalid_subscription" };
  }

  const { athlete } = await requireAthlete();
  const admin = createAdminClient();
  const userAgent = (await headers()).get("user-agent");

  const { error } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        athlete_id: athlete.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: userAgent,
        last_used_at: null,
        last_error_at: null,
        last_error_code: null,
      },
      { onConflict: "endpoint" },
    );
  if (error) {
    console.error("push subscribe upsert failed", error);
    return { ok: false, reason: "invalid_subscription" };
  }

  await admin
    .from("preferences")
    .upsert(
      { athlete_id: athlete.id, push_enabled: true },
      { onConflict: "athlete_id" },
    );

  return { ok: true };
}

/**
 * Removes the subscription for the given endpoint and flips push_enabled off
 * if no other endpoints remain. Endpoint-scoped — unsubscribing one device
 * doesn't kill others.
 */
export async function unsubscribePush(endpoint: string): Promise<void> {
  if (!endpoint) return;
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  await admin
    .from("push_subscriptions")
    .delete()
    .eq("athlete_id", athlete.id)
    .eq("endpoint", endpoint);

  const { count } = await admin
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("athlete_id", athlete.id);

  if ((count ?? 0) === 0) {
    await admin
      .from("preferences")
      .update({ push_enabled: false })
      .eq("athlete_id", athlete.id);
  }
}

/**
 * Skip the notifications onboarding step without subscribing. Leaves the
 * preference untouched so a later prompt can still flip it on.
 */
export async function skipNotifications(): Promise<void> {
  // Imported lazily to avoid a circular module graph between the onboarding
  // action helpers and this file.
  const { advanceFrom } = await import("@/app/actions/onboarding");
  await advanceFrom("notifications");
}

export async function completeNotifications(): Promise<void> {
  const { advanceFrom } = await import("@/app/actions/onboarding");
  await advanceFrom("notifications");
}

/**
 * Fire a test push to the signed-in athlete's devices. Used by the dev page
 * and the subscribe-confirm step in onboarding so the athlete sees the very
 * notification land in real life.
 */
export async function sendTestPush(payload?: Partial<PushPayload>): Promise<{
  attempted: number;
  delivered: number;
  pruned: number;
  errors: number;
}> {
  const { athlete } = await requireAthlete();
  return sendPushToAthlete(athlete.id, {
    title: payload?.title ?? "Coach Casey",
    body:
      payload?.body ??
      "Notifications are on. Finish a run and a debrief will land here.",
    tag: payload?.tag ?? "test",
    url: payload?.url ?? "/app",
  });
}
