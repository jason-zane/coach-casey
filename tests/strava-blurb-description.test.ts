import assert from "node:assert/strict";
import test from "node:test";
import {
  composeDescriptionWithBlurb,
  scopeHasActivityWrite,
  stripPriorCaseyBlock,
} from "../lib/strava/blurb-description.ts";

// Mirrors STRAVA_BLURB_SIGNATURE in lib/llm/debrief.ts (that module pulls
// in `server-only` and the `@/` alias, which this runner can't load). The
// strip logic anchors on the "coached by Coach Casey" stem, so these tests
// pin that contract.
const SIGNATURE = "coached by Coach Casey · coachcasey.app";

const VERDICT = "An easy run that stayed easy. Underrated.";
const BLOCK = `${VERDICT}\n\n${SIGNATURE}`;

test("scopeHasActivityWrite requires the exact scope token", () => {
  assert.equal(
    scopeHasActivityWrite("read,activity:read_all,activity:write,profile:read_all"),
    true,
  );
  assert.equal(scopeHasActivityWrite("activity:write"), true);
  assert.equal(scopeHasActivityWrite("read, activity:write ,profile:read_all"), true);
  assert.equal(
    scopeHasActivityWrite("read,activity:read_all,profile:read_all"),
    false,
  );
  // Substrings must not pass; only the exact comma-separated token counts.
  assert.equal(scopeHasActivityWrite("activity:write_all"), false);
  assert.equal(scopeHasActivityWrite(""), false);
  assert.equal(scopeHasActivityWrite(null), false);
  assert.equal(scopeHasActivityWrite(undefined), false);
});

test("stripPriorCaseyBlock removes a tail block and preserves athlete text", () => {
  const description = `Felt strong today, calf behaved.\n\n${BLOCK}`;
  assert.equal(
    stripPriorCaseyBlock(description, SIGNATURE),
    "Felt strong today, calf behaved.",
  );
});

test("stripPriorCaseyBlock removes a block that is the whole description", () => {
  assert.equal(stripPriorCaseyBlock(BLOCK, SIGNATURE), "");
});

test("stripPriorCaseyBlock recognises the legacy signature variant", () => {
  // Blocks posted under the earlier signature carried a leading em dash
  // (written as the \u2014 escape so the repo stays free of the literal
  // character). Those descriptions still exist on Strava; the strip
  // anchors on the "coached by Coach Casey" stem, so they are recognised
  // and replaced rather than stacked.
  const legacy = `${VERDICT}\n\n\u2014 coached by Coach Casey · coachcasey.app`;
  assert.equal(stripPriorCaseyBlock(legacy, SIGNATURE), "");
});

test("stripPriorCaseyBlock leaves athlete content after the signature alone", () => {
  const edited = `${BLOCK}\n\nMy own splits notes below the line.`;
  assert.equal(stripPriorCaseyBlock(edited, SIGNATURE), edited);
});

test("stripPriorCaseyBlock leaves unrelated descriptions untouched", () => {
  const description = "Tempo with the club, two laps of the park.";
  assert.equal(stripPriorCaseyBlock(description, SIGNATURE), description);
});

test("compose writes the bare block onto an empty description", () => {
  const result = composeDescriptionWithBlurb("", BLOCK, SIGNATURE);
  assert.deepEqual(result, { kind: "write", next: BLOCK });
});

test("compose appends below athlete text with a blank line, never over it", () => {
  const result = composeDescriptionWithBlurb(
    "Felt strong today, calf behaved.",
    BLOCK,
    SIGNATURE,
  );
  assert.deepEqual(result, {
    kind: "write",
    next: `Felt strong today, calf behaved.\n\n${BLOCK}`,
  });
});

test("compose replaces a prior Casey block instead of stacking", () => {
  const existing = `Felt strong today.\n\nOld verdict line.\n\n${SIGNATURE}`;
  const result = composeDescriptionWithBlurb(existing, BLOCK, SIGNATURE);
  assert.deepEqual(result, {
    kind: "write",
    next: `Felt strong today.\n\n${BLOCK}`,
  });
});

test("compose no-ops when the description is already current", () => {
  const existing = `Felt strong today.\n\n${BLOCK}`;
  const result = composeDescriptionWithBlurb(existing, BLOCK, SIGNATURE);
  assert.deepEqual(result, { kind: "skip", reason: "already_current" });
});

test("compose skips when the athlete edited around the prior block", () => {
  // Athlete added their own text after the signature; re-appending would
  // stack a second Casey block, so the write is skipped entirely.
  const edited = `${BLOCK}\n\nMy own splits notes below the line.`;
  const result = composeDescriptionWithBlurb(edited, BLOCK, SIGNATURE);
  assert.deepEqual(result, { kind: "skip", reason: "athlete_edited" });
});
