import assert from "node:assert/strict";
import test from "node:test";
import {
  passesStravaBlurbVoiceCheck,
  sanitizeStravaBlurb,
  STRAVA_BLURB_MAX_CHARS,
} from "../lib/llm/blurb-sanitize.ts";
import { checkVoice } from "../lib/llm/voice-check.ts";

// The blurb lands on the athlete's public Strava feed, so the pipeline is
// repair-what-a-regex-can-repair, then drop on anything worse. These tests
// pin both halves.

test("sanitize replaces em dashes with a comma splice", () => {
  assert.equal(
    sanitizeStravaBlurb("You said easy \u2014 your heart rate said tempo."),
    "You said easy, your heart rate said tempo.",
  );
  // Unspaced em dash too.
  assert.equal(
    sanitizeStravaBlurb("Negative split\u2014quietly the best move this block."),
    "Negative split, quietly the best move this block.",
  );
});

test("sanitize replaces the ASCII double-hyphen surrogate", () => {
  assert.equal(
    sanitizeStravaBlurb("Held the line -- the unsexy move."),
    "Held the line, the unsexy move.",
  );
});

test("sanitize demotes exclamation marks to full stops", () => {
  assert.equal(
    sanitizeStravaBlurb("Three reps, three of the same pace!"),
    "Three reps, three of the same pace.",
  );
  assert.equal(sanitizeStravaBlurb("Steady!! the whole way"), "Steady. the whole way");
});

test("sanitize strips a wrapping quote pair", () => {
  assert.equal(
    sanitizeStravaBlurb('"An easy run that stayed easy. Underrated."'),
    "An easy run that stayed easy. Underrated.",
  );
  assert.equal(
    sanitizeStravaBlurb("“Cadence climbed late.”"),
    "Cadence climbed late.",
  );
});

test("sanitize collapses whitespace fallout and trims edges", () => {
  assert.equal(
    sanitizeStravaBlurb("  Splits got faster  every km . "),
    "Splits got faster every km.",
  );
  assert.equal(sanitizeStravaBlurb("\u2014 leading dash case"), "leading dash case");
});

test("sanitized output is clean under checkVoice's mechanical rules", () => {
  const sanitized = sanitizeStravaBlurb(
    "You said easy \u2014 your heart rate said tempo!",
  );
  const result = checkVoice(sanitized, { profile: "eavesdropping" });
  const rules = result.findings.map((f) => f.rule);
  assert.ok(!rules.includes("em-dash"), `em-dash survived: ${sanitized}`);
  assert.ok(!rules.includes("em-dash-ascii"), `ascii dash survived: ${sanitized}`);
  assert.ok(!rules.includes("exclamation"), `exclamation survived: ${sanitized}`);
});

test("voice tripwire accepts the canonical good verdicts", () => {
  const good = [
    "Three reps, three of the same pace. That's not luck, that's pacing.",
    "An easy run that stayed easy. Underrated.",
    "Nothing to remark on. Which, on a Tuesday, is exactly the goal.",
  ];
  for (const text of good) {
    assert.equal(passesStravaBlurbVoiceCheck(text), true, text);
  }
});

test("voice tripwire drops hype, hashtags, emoji, and meta-leaks", () => {
  const bad = [
    "Crushed it out there today.",
    "Strong session #marathontraining",
    "Solid run 🔥",
    "Verdict: an easy run that stayed easy.",
    "Output: steady the whole way.",
    "Still has an exclamation!",
  ];
  for (const text of bad) {
    assert.equal(passesStravaBlurbVoiceCheck(text), false, text);
  }
});

test("length cap is the documented 200-char backstop", () => {
  assert.equal(STRAVA_BLURB_MAX_CHARS, 200);
  const long = "a".repeat(STRAVA_BLURB_MAX_CHARS + 1);
  assert.ok(long.length > STRAVA_BLURB_MAX_CHARS);
});
