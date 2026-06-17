import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseBodyPart,
  planNiggleWrites,
} from "../lib/thread/niggle-dedup.ts";

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
