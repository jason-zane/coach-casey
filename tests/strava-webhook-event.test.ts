import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeWebhookSecret,
  authorizeWebhookSubscription,
  liveWebhookSecurityRequired,
  parseStravaWebhookEvent,
  type StravaWebhookEvent,
} from "../lib/strava/webhook-event.ts";

const validEvent = {
  aspect_type: "create",
  event_time: 1760000000,
  object_id: 123,
  object_type: "activity",
  owner_id: 456,
  subscription_id: 789,
  updates: {},
};

test("parseStravaWebhookEvent accepts the expected Strava event shape", () => {
  assert.deepEqual(parseStravaWebhookEvent(validEvent), validEvent);
});

test("parseStravaWebhookEvent rejects malformed or unsafe events", () => {
  assert.equal(parseStravaWebhookEvent(null), null);
  assert.equal(parseStravaWebhookEvent({ ...validEvent, aspect_type: "rename" }), null);
  assert.equal(parseStravaWebhookEvent({ ...validEvent, object_type: "segment" }), null);
  assert.equal(parseStravaWebhookEvent({ ...validEvent, object_id: -1 }), null);
  assert.equal(parseStravaWebhookEvent({ ...validEvent, updates: [] }), null);
});

test("webhook secret fails closed in live or production mode", () => {
  assert.equal(liveWebhookSecurityRequired({ NODE_ENV: "production" }), true);
  assert.equal(liveWebhookSecurityRequired({ STRAVA_MODE: "live" }), true);
  assert.equal(liveWebhookSecurityRequired({ NODE_ENV: "development" }), false);

  assert.deepEqual(
    authorizeWebhookSecret({ expected: undefined, provided: null, required: true }),
    {
      ok: false,
      status: 500,
      error: "STRAVA_WEBHOOK_EVENT_SECRET not configured",
    },
  );
  assert.deepEqual(
    authorizeWebhookSecret({ expected: undefined, provided: null, required: false }),
    { ok: true },
  );
  assert.deepEqual(
    authorizeWebhookSecret({ expected: "secret", provided: "wrong", required: true }),
    { ok: false, status: 401, error: "unauthorized webhook event" },
  );
  assert.deepEqual(
    authorizeWebhookSecret({ expected: "secret", provided: "secret", required: true }),
    { ok: true },
  );
});

test("webhook subscription id must match when configured", () => {
  const event = validEvent as StravaWebhookEvent;
  assert.deepEqual(authorizeWebhookSubscription(event, "789", true), { ok: true });
  assert.deepEqual(authorizeWebhookSubscription(event, "790", true), {
    ok: false,
    status: 401,
    error: "unexpected webhook subscription",
  });
  assert.deepEqual(authorizeWebhookSubscription(event, undefined, false), { ok: true });
});
