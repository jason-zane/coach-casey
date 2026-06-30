import { NextResponse } from "next/server";
import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchActivityDetail } from "@/lib/strava/client";
import { captureError } from "@/lib/observability/capture";
import { generateDebriefForActivity } from "@/lib/server/debrief-pipeline";
import { generateCrossTrainingAckForActivity } from "@/lib/server/cross-training-pipeline";
import { ensureStravaLine } from "@/lib/server/strava-line";
import { classifyActivityType } from "@/lib/strava/activity-types";
import {
  authorizeWebhookSubscription,
  liveWebhookSecurityRequired,
  parseStravaWebhookEvent,
  type StravaWebhookEvent,
} from "@/lib/strava/webhook-event";

export const runtime = "nodejs";
// Webhook ACKs are tiny; the real work runs in `after()`. Keeping a tight
// maxDuration on the initial response; the async work has its own ceiling
// governed by the function's overall timeout budget.
export const maxDuration = 60;

/**
 * Strava Push Subscriptions webhook endpoint.
 *
 * Strava registers a callback URL like `/api/strava/webhook/<secret>` where
 * `<secret>` is the value of `STRAVA_WEBHOOK_EVENT_SECRET`. Strava preserves
 * the URL path on event POSTs (it strips query params and fragments, which
 * is why an earlier `?secret=...` design never delivered, verified
 * 2026-05-12). The path segment is therefore our real auth boundary, the
 * subscription_id check below is defense-in-depth against forged events
 * that happen to land on the right path.
 *
 * GET, subscription challenge. After we POST a subscription request to
 *   Strava's API with { callback_url, verify_token }, Strava calls our
 *   callback with `?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`.
 *   We verify both the path secret and the verify_token, then echo the
 *   challenge.
 *
 * POST, events. Strava delivers { aspect_type, object_type, object_id,
 *   owner_id, subscription_id, updates }. We ACK with 200 in under two
 *   seconds and do the real work in an async hook (`after()`).
 *
 * One subscription per Strava developer app. Managed via
 * `scripts/strava-webhook-subscribe.ts`.
 */

type RouteContext = { params: Promise<{ secret: string }> };

export async function GET(request: Request, ctx: RouteContext) {
  const secretCheck = await authorizePathSecret(ctx);
  if (!secretCheck.ok) return secretCheck.response;

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

export async function POST(request: Request, ctx: RouteContext) {
  const secretCheck = await authorizePathSecret(ctx);
  if (!secretCheck.ok) return secretCheck.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "malformed webhook body" }, { status: 400 });
  }

  const event = parseStravaWebhookEvent(raw);
  if (!event) {
    return NextResponse.json({ error: "invalid webhook event" }, { status: 400 });
  }

  const subscription = authorizeWebhookSubscription(
    event,
    process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID,
    liveWebhookSecurityRequired(),
  );
  if (!subscription.ok) {
    return NextResponse.json(
      { error: subscription.error },
      { status: subscription.status },
    );
  }

  // Handle the event off the response path. `after()` runs after the 200 is
  // sent, so Strava gets its sub-2s ACK while we do the real work.
  after(async () => {
    try {
      await handleEvent(event);
    } catch (e) {
      // Strava won't retry unless we return non-2xx, so a failure here is on
      // us to catch. The poll-safety-net cron recovers a missed debrief;
      // captureError makes the failure visible on the admin dashboard.
      console.error("strava webhook handler failed", { event, error: e });
      await captureError(e, {
        source: "webhook",
        route: "/api/strava/webhook",
        context: {
          objectType: event.object_type,
          aspectType: event.aspect_type,
          ownerId: event.owner_id,
        },
      });
    }
  });

  return new Response(null, { status: 200 });
}

type SecretCheck =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Constant-time compare of the dynamic `[secret]` path segment against
 * `STRAVA_WEBHOOK_EVENT_SECRET`. Returns 404 (not 401) on mismatch so the
 * path looks indistinguishable from any other unrouted URL to an attacker
 * probing the API surface, no signal that they found the right shape.
 *
 * Fails closed when the env var is not configured in production.
 */
async function authorizePathSecret(ctx: RouteContext): Promise<SecretCheck> {
  const { secret: provided } = await ctx.params;
  const expected = process.env.STRAVA_WEBHOOK_EVENT_SECRET;
  if (!expected) {
    if (liveWebhookSecurityRequired()) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "STRAVA_WEBHOOK_EVENT_SECRET not configured" },
          { status: 500 },
        ),
      };
    }
    // Dev / mock mode: no secret configured, accept anything.
    return { ok: true };
  }
  if (!constantTimeEqual(provided, expected)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "not found" }, { status: 404 }),
    };
  }
  return { ok: true };
}

function constantTimeEqual(left: string, right: string): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function handleEvent(event: StravaWebhookEvent): Promise<void> {
  const admin = createAdminClient();

  // Athlete deauthorisation. Strava emits this when the athlete revokes
  // Coach Casey from strava.com/settings/apps. Payload shape:
  //   { object_type: "athlete", aspect_type: "update",
  //     updates: { authorized: "false" }, owner_id: <strava_athlete_id> }
  // Required by Strava's developer guidelines: clean up the local
  // connection so we stop attempting to sync.
  if (event.object_type === "athlete") {
    const authorized = event.updates?.authorized;
    if (authorized === "false" || authorized === false) {
      await admin
        .from("strava_connections")
        .delete()
        .eq("strava_athlete_id", event.owner_id);
    }
    return;
  }

  if (event.object_type !== "activity") return;

  // strava_athlete_id is unique (partial index), so maybeSingle() can no
  // longer error on duplicate rows. Any error left is a real failure;
  // throw so the after() catch logs it instead of dropping the event with
  // no trace.
  const { data: conn, error: connError } = await admin
    .from("strava_connections")
    .select("athlete_id")
    .eq("strava_athlete_id", event.owner_id)
    .maybeSingle();
  if (connError) throw connError;

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
  //   run           , post-run debrief
  //   cross_training, cross-training acknowledgement
  //   catch_all     , cross-training acknowledgement (catch-all variant)
  //   ambient       , stored only; no thread message (e.g. Walk)
  //
  // Both downstream pipelines are idempotent, a webhook retry returns
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
      // Stored only, Walks and similar low-signal types are ambient
      // context, not thread-worthy.
      break;
  }

  // Casey's one-line verdict goes on EVERY activity's Strava description,
  // independent of the in-app message routing above (runs, rides, swims,
  // gym, walks all get one). Idempotent via activities.strava_line_written_at,
  // so create + update events and webhook retries don't double-post.
  // Isolated so a Strava/LLM hiccup here can't undo the message work above.
  try {
    await ensureStravaLine(athleteId, activityId);
  } catch (err) {
    console.warn("strava line writeback failed in webhook", err);
  }
}
