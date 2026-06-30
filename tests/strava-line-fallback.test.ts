import assert from "node:assert/strict";
import test from "node:test";
import {
  activityKindLabel,
  fallbackStravaLine,
  stravaLineKind,
  type StravaLineKind,
} from "../lib/strava/line-fallback.ts";
import {
  passesStravaBlurbVoiceCheck,
  sanitizeStravaBlurb,
  STRAVA_BLURB_MAX_CHARS,
} from "../lib/llm/blurb-sanitize.ts";
import { checkVoice } from "../lib/llm/voice-check.ts";

// The fallback line lands on the athlete's PUBLIC Strava feed whenever the
// model's line fails the voice check, so every variant has to clear the
// same bar as a generated line. These tests pin the classification and
// prove the fallback strings are clean by construction.

test("stravaLineKind buckets Strava types (substring tolerant)", () => {
  const cases: Array<[string | null, StravaLineKind]> = [
    ["Run", "run"],
    ["TrailRun", "run"],
    ["VirtualRun", "run"],
    ["Ride", "ride"],
    ["VirtualRide", "ride"],
    ["EBikeRide", "ride"],
    ["Swim", "swim"],
    ["Walk", "walk"],
    ["Hike", "walk"],
    ["Yoga", "yoga"],
    ["Pilates", "yoga"],
    ["WeightTraining", "gym"],
    ["Workout", "gym"],
    ["Crossfit", "gym"],
    ["Kayaking", "other"],
    [null, "other"],
    ["", "other"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(stravaLineKind(input), expected, `${input} -> ${expected}`);
  }
});

test("activityKindLabel gives a human label per kind", () => {
  assert.equal(activityKindLabel("Run"), "a run");
  assert.equal(activityKindLabel("VirtualRide"), "a bike ride");
  assert.equal(activityKindLabel("Swim"), "a swim");
  assert.equal(activityKindLabel("WeightTraining"), "a strength session");
  assert.equal(activityKindLabel("Yoga"), "a mobility session");
  assert.equal(activityKindLabel("Walk"), "a walk");
  assert.equal(activityKindLabel("Kayaking"), "a session");
});

test("fallbackStravaLine is deterministic and seed-selected", () => {
  // Same input, same output.
  assert.equal(
    fallbackStravaLine({ activityType: "Ride", seed: 7 }),
    fallbackStravaLine({ activityType: "Ride", seed: 7 }),
  );
  // Seed selects the variant by modulo, so seed and seed+variantCount match.
  // Each kind ships 3 variants, so a 3-apart pair must collide.
  assert.equal(
    fallbackStravaLine({ activityType: "Ride", seed: 0 }),
    fallbackStravaLine({ activityType: "Ride", seed: 3 }),
  );
  // Null/absent seed is safe and stable.
  assert.equal(
    fallbackStravaLine({ activityType: "Run", seed: null }),
    fallbackStravaLine({ activityType: "Run" }),
  );
});

test("every fallback line clears the public voice + length bar", () => {
  const kinds = ["Run", "Ride", "Swim", "WeightTraining", "Yoga", "Walk", "Kayaking"];
  const lines = new Set<string>();
  for (const type of kinds) {
    for (let seed = 0; seed < 3; seed++) {
      lines.add(fallbackStravaLine({ activityType: type, seed }));
    }
  }
  assert.ok(lines.size >= 7, "expected a spread of distinct fallback lines");

  for (const line of lines) {
    // Already clean: the sanitiser is a no-op on a well-formed line.
    assert.equal(sanitizeStravaBlurb(line), line, `not pre-clean: ${line}`);
    // Hard tripwire (no exclamation, hashtag, emoji, hype, meta-leak).
    assert.ok(passesStravaBlurbVoiceCheck(line), `fails tripwire: ${line}`);
    // Under the absolute length backstop (and comfortably under the target).
    assert.ok(line.length <= STRAVA_BLURB_MAX_CHARS, `too long: ${line}`);
    // Shared eavesdropping voice check (no em dash, hype, sycophancy, ...).
    assert.ok(checkVoice(line, { profile: "eavesdropping" }).ok, `voice fail: ${line}`);
  }
});
