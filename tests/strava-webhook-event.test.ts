import assert from "node:assert/strict";
import test from "node:test";
import {
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

test("liveWebhookSecurityRequired detects live and production envs", () => {
  assert.equal(liveWebhookSecurityRequired({ NODE_ENV: "production" }), true);
  assert.equal(liveWebhookSecurityRequired({ STRAVA_MODE: "live" }), true);
  assert.equal(liveWebhookSecurityRequired({ NODE_ENV: "development" }), false);
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
