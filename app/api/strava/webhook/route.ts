import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchActivityDetail } from "@/lib/strava/client";
import { generateDebriefForActivity } from "@/app/actions/debrief";
import { generateCrossTrainingAckForActivity } from "@/app/actions/cross-training";
import { classifyActivityType } from "@/lib/strava/activity-types";

export const runtime = "nodejs";
// Webhook ACKs are tiny; the real work runs in `after()`. Keeping a tight
// maxDuration on the initial response; the async work has its own ceiling
// governed by the function's overall timeout budget.
export const maxDuration = 60;

/**
 * Strava Push Subscriptions webhook endpoint.
 *
 * GET — subscription challenge. Strava POSTs a subscription request to its
 *   own API with { callback_url, verify_token }; it then calls this GET with
 *   `hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`. We verify
 *   the token and echo the challenge.
 *
 * POST — events. Strava delivers { aspect_type, object_type, object_id,
 *   owner_id, subscription_id, updates }. We ACK with 200 in under two
 *   seconds and do the real work in an async hook (`after()`).
 *
 * One subscription per application. Managed via
 * `scripts/strava-webhook-subscribe.ts`.
 */

type StravaWebhookEvent = {
  aspect_type: "create" | "update" | "delete";
  event_time: number;
  object_id: number; // activity id (or athlete id for athlete events)
  object_type: "activity" | "athlete";
  owner_id: number; // strava athlete id
  subscription_id: number;
  updates?: Record<string, unknown>;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "STRAVA_WEBHOOK_VERIFY_TOKEN not configured" },
      { status: 500 },
    );
  }

  if (mode !== "subscribe" || token !== expected || !challenge) {
    return NextResponse.json({ error: "verification failed" }, { status: 403 });
  }

  // Strava expects this exact shape back.
  return NextResponse.json({ "hub.challenge": challenge });
}

export async function POST(request: Request) {
  let event: StravaWebhookEvent;
  try {
    event = (await request.json()) as StravaWebhookEvent;
  } catch {
    // Malformed body — acknowledge anyway so Strava doesn't retry endlessly.
    return new Response(null, { status: 200 });
  }

  // Handle the event off the response path. `after()` runs after the 200 is
  // sent, so Strava gets its sub-2s ACK while we do the real work.
  after(async () => {
    try {
      await handleEvent(event);
    } catch (e) {
      // Strava won't retry unless we return non-2xx, so a failure here is
      // on us to catch via logs. The poll-safety-net cron picks up
      // activities that didn't produce a debrief.
      console.error("strava webhook handler failed", { event, error: e });
    }
  });

  return new Response(null, { status: 200 });
}

async function handleEvent(event: StravaWebhookEvent): Promise<void> {
  if (event.object_type !== "activity") return; // Athlete deauth events are a separate concern.

  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("strava_connections")
    .select("athlete_id")
    .eq("strava_athlete_id", event.owner_id)
    .maybeSingle();

  const athleteId = (conn as { athlete_id: string } | null)?.athlete_id;
  if (!athleteId) {
    // Event for an athlete we don't know. Could be a stale subscription or a
    // disconnected athlete. Drop silently.
    return;
  }

  if (event.aspect_type === "delete") {
    // Leave the activity and debrief in place for now. The thread is
    // append-only and a deleted Strava activity doesn't retroactively
    // invalidate the athlete's debrief. A future pass can mark the
    // underlying activity row as deleted.
    return;
  }

  // create or update: fetch the detail (with laps) and upsert.
  const detail = await fetchActivityDetail(athleteId, event.object_id);
  const rawType = detail.sport_type ?? detail.type ?? null;
  const activityClass = classifyActivityType(rawType);

  const row = {
    athlete_id: athleteId,
    strava_id: detail.id,
    start_date_local: detail.start_date_local,
    name: detail.name,
    activity_type: detail.sport_type ?? detail.type ?? null,
    distance_m: detail.distance,
    moving_time_s: detail.moving_time,
    avg_pace_s_per_km:
      detail.distance && detail.moving_time
        ? Math.round(detail.moving_time / (detail.distance / 1000))
        : null,
    avg_hr: detail.average_heartrate ? Math.round(detail.average_heartrate) : null,
    max_hr: detail.max_heartrate ? Math.round(detail.max_heartrate) : null,
    elevation_gain_m: detail.total_elevation_gain ?? null,
    raw: detail as unknown as Record<string, unknown>,
    laps: detail.laps ?? null,
  };

  const { data: upserted, error } = await admin
    .from("activities")
    .upsert(row, { onConflict: "athlete_id,strava_id" })
    .select("id")
    .single();
  if (error) throw error;
  const activityId = (upserted as { id: string }).id;

  // Route to the right pipeline based on activity classification:
  //   run            — post-run debrief
  //   cross_training — cross-training acknowledgement
  //   catch_all      — cross-training acknowledgement (catch-all variant)
  //   ambient        — stored only; no thread message (e.g. Walk)
  //
  // Both downstream pipelines are idempotent — a webhook retry returns
  // `{ kind: "exists" }` rather than duplicating. Force-regeneration is
  // never triggered from the webhook; that's a product-side decision.
  const force = false;
  switch (activityClass) {
    case "run":
      await generateDebriefForActivity(athleteId, activityId, { force });
      break;
    case "cross_training":
    case "catch_all":
      await generateCrossTrainingAckForActivity(athleteId, activityId, { force });
      break;
    case "ambient":
      // Stored only — Walks and similar low-signal types are ambient
      // context, not thread-worthy.
      break;
  }
}
