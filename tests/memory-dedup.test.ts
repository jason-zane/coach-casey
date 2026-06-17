import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseBodyPart,
  planContextWrites,
  planNiggleWrites,
} from "../lib/thread/memory-dedup.ts";

test("normaliseBodyPart rolls up side prefixes and punctuation", () => {
  assert.equal(normaliseBodyPart("Left Calf"), "calf");
  assert.equal(normaliseBodyPart("right achilles"), "achilles");
  assert.equal(normaliseBodyPart("calf!"), "calf");
  assert.equal(normaliseBodyPart("  CALF tight "), "calf tight");
  assert.equal(normaliseBodyPart(null), null);
  assert.equal(normaliseBodyPart(""), null);
});

test("a conversation that mentions the calf several times lands as one niggle", () => {
  // The reported bug: one chat, remember_injury fired 3×.
  const plan = planNiggleWrites(
    [
      { content: "calf feels tight", tag: "calf" },
      { content: "calf tight on the climbs", tag: "calf" },
      { content: "right calf, mild", tag: "right calf" },
    ],
    [],
  );
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.inserts.length, 1, "collapses to a single niggle");
  // Latest mention wins.
  assert.equal(plan.inserts[0].content, "right calf, mild");
});

test("a second same-day mention refreshes the existing niggle instead of duplicating", () => {
  const plan = planNiggleWrites(
    [{ content: "calf still niggly", tag: "calf" }],
    [{ id: "niggle-1", tags: ["calf"] }],
  );
  assert.deepEqual(plan.inserts, []);
  assert.equal(plan.updates.length, 1);
  assert.deepEqual(plan.updates[0], { id: "niggle-1", content: "calf still niggly" });
});

test("the newest same-part niggle from today is the one refreshed", () => {
  // existingToday is newest-first.
  const plan = planNiggleWrites(
    [{ content: "calf update", tag: "calf" }],
    [
      { id: "newer", tags: ["calf"] },
      { id: "older", tags: ["left calf"] },
    ],
  );
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].id, "newer");
});

test("distinct body parts stay distinct", () => {
  const plan = planNiggleWrites(
    [
      { content: "calf tight", tag: "calf" },
      { content: "achilles sore", tag: "achilles" },
    ],
    [{ id: "n-achilles", tags: ["achilles"] }],
  );
  // calf is new -> insert; achilles already exists today -> update.
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0].tag, "calf");
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].id, "n-achilles");
});

test("empty content or tag is ignored", () => {
  const plan = planNiggleWrites(
    [
      { content: "", tag: "calf" },
      { content: "knee twinge", tag: "" },
    ],
    [],
  );
  assert.deepEqual(plan, { updates: [], inserts: [] });
});

// --- life context -----------------------------------------------------------

test("a conversation that re-mentions the same context lands as one note", () => {
  const plan = planContextWrites(
    [
      { content: "work has been stressful", tags: ["work"] },
      { content: "big deadline at work this week", tags: ["work"] },
    ],
    [],
  );
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0].content, "big deadline at work this week");
});

test("a second same-day context note with the same tags refreshes it", () => {
  const plan = planContextWrites(
    [{ content: "still slammed at work", tags: ["work"] }],
    [{ id: "ctx-1", tags: ["work"] }],
  );
  assert.deepEqual(plan.inserts, []);
  assert.deepEqual(plan.updates, [{ id: "ctx-1", content: "still slammed at work" }]);
});

test("context with different tag sets stays separate (no over-merge)", () => {
  const plan = planContextWrites(
    [
      { content: "sleeping badly", tags: ["sleep"] },
      { content: "deadline pressure", tags: ["work"] },
      { content: "tired from travel and work", tags: ["work", "travel"] },
    ],
    [],
  );
  // Three distinct tag sets: sleep, work, work+travel — none merge.
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.inserts.length, 3);
});

test("context tag order does not matter for identity", () => {
  const plan = planContextWrites(
    [{ content: "wedding weekend away", tags: ["travel", "family"] }],
    [{ id: "ctx-x", tags: ["family", "travel"] }],
  );
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].id, "ctx-x");
});

test("tagless context never merges and always inserts", () => {
  const plan = planContextWrites(
    [
      { content: "feeling good lately", tags: [] },
      { content: "a bit flat today", tags: [] },
    ],
    [{ id: "ctx-old", tags: [] }],
  );
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.inserts.length, 2);
});
