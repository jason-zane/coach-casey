/**
 * Voice-check eval harness.
 *
 * Runs `checkVoice` against a corpus of mock outputs (deterministic,
 * shipped in `lib/llm/mocks.ts`) plus a small set of intentionally bad
 * inputs that must trip the validator. Catches voice regressions in the
 * mocks themselves, and verifies the validator catches the patterns it
 * claims to catch.
 *
 * Run with:
 *   node --experimental-strip-types scripts/eval-voice.mts
 *
 * (Node 24 supports type-stripping for .mts files. Earlier versions need
 * the flag; later versions enable it by default.)
 */

import { checkVoice, type VoiceProfile } from "../lib/llm/voice-check.ts";

// The mock corpus is duplicated here rather than imported from
// `lib/llm/mocks.ts`. That module imports `server-only` and the Anthropic
// SDK, which can't load in a plain Node process. When you add a new mock
// string in `lib/llm/mocks.ts`, also add it here so the validator
// continues to cover it.

const MOCK_VALIDATION_OBSERVATIONS = [
  "You've been averaging about 55km a week over the last couple of months, with most weeks looking like five runs. Sundays read like your long day, Wednesdays look like the harder session. That match what you're running?",
  "Your easy days sit around 5:20/km, and the Wednesday workouts drop into the 4:10 to 4:20 range on average. HR stays down on the easy runs. Does that line up with what you're aiming for?",
  "Long runs have been creeping up, 22, 24, 28, then 32km a couple of weeks back. That read like the build you'd planned, or has it stretched further than intended?",
  "Looks like there's a week in the middle where the mileage drops right off, just a couple of short runs. Sick, travelling, or something else going on?",
  "One Saturday a few weeks back, what reads as an easy day came out closer to 4:58/km, a good chunk quicker than your usual easy. Group run, or feeling fresh?",
];

type Sample = {
  label: string;
  text: string;
  profile?: VoiceProfile;
  athleteName?: string | null;
  /** When set, the validator MUST emit at least one finding with this rule id. */
  expectViolation?: string;
};

// ---------------------------------------------------------------------------
// Mock corpus (must pass)

const MOCK_DEBRIEF_BODIES = [
  "Steady 8.2 km on Tuesday, 5:18/km. Last week totaled 52.4 km across 5 runs.",
  "Workout shape today: 5 laps, pace spread of 22s/km. Reads like a steady tempo with one rep that opened up.",
  "First one I've read for you, so take this as a starting point rather than a full reading.\n\nSteady 6.0 km on Sunday, 5:40/km.",
];

const MOCK_FOLLOWUPS = [
  "How did the last rep feel relative to the first two?",
  "Calf still holding up alright after that one?",
  "Was today meant to be threshold, or did you end up there by feel?",
];

const MOCK_STRAVA_BLURBS = [
  "Three reps, three of the same pace. That's not luck, that's pacing.",
  "An easy run that stayed easy. Underrated.",
  "Held the line on an easy day. The unsexy move that makes Sunday's long run possible.",
];

const MOCK_RPE_BRANCHED = [
  "Came in higher than the shape of the run suggests, 8 on something easy. What was going on?",
  "Softer number than I'd have expected for that one. Conservative, or feeling sharp?",
];

const MOCK_CHAT = [
  "Noted. I'll keep an eye on how that travels through the week. If it's still there on your next easy run, worth easing off the pace for a day or two and seeing if it settles.",
  "Heard. Anything specific on your mind, or just checking in?",
];

// Casey refresh proactive surfaces (2026-05-16). Mirrors the mock
// outputs in lib/llm/mocks.ts so the eval catches voice drift in the
// proactive-surface mocks.

const MOCK_RACE_WEEK_BRIEFING = [
  "Two weeks to your race. Taper starts properly this week, and Sunday's long is the last real long before the race. Anything you want to nail down, pacing, fuelling, anything you're worried about?",
  "Ten days out from your race. Anything you want to nail down before the taper does its work?",
  "Race week. Taper feel right, or heavy legs? The Wednesday session is the last real test of the legs, treat it as the read, not as fitness work.",
  "Three days out. Carb load is on now, aim for the familiar foods, not the new ones. How's the sleep been this week?",
  "Two days. Most of the work is done. Tomorrow is the shake-out and the early-night day.",
  "Race day tomorrow. What's the morning plan, wake, breakfast, transport, start? And the early-mile call, opening on target, or holding behind?",
  "Race day. The early miles call is conservative, trust the build. Run the race that gets you to 30km with something left.",
];

const MOCK_FUELING_PRERUN = [
  "Long run tomorrow. What's the fuelling plan, gels, drinks, or running it empty?",
  "Long run tomorrow. Usual fuelling, or testing anything new?",
  "Long run tomorrow, and you're inside the race build now. Worth rehearsing the race-day gel cadence on this one if you haven't yet.",
];

const MOCK_FUELING_RETROSPECTIVE = [
  "Saw the long run on Sunday. Did you take anything in, or run it empty? Worth knowing for next time.",
  "Saw the long run on Sunday. Stuck with the usual fuelling, or shifted it?",
];

const MOCK_NIGGLE_ESCALATION = [
  "Third time the calf has come up in two weeks. Same flavour, or shifting? Worth flagging to your coach if you haven't yet, they'll have the picture on the block.",
  "Third time the calf has come up in two weeks. Same flavour, or shifting? Worth getting a physio to look before it sets in.",
];

const MOCK_MID_BLOCK_FLATNESS = [
  "Last two weeks the easy runs have been heavier and the workouts have lost a bit of edge. Could be the build catching up, could be sleep or work pressure. How's the body actually reading it?",
  "Easy paces have drifted slower for ten days and the last workout didn't sit on target. Worth a word with your coach if it's been on your mind too.",
  "Workouts have come in flat the last three sessions, easy paces drifting slower. The life context you mentioned a couple of weeks back probably explains some of it. How's the body actually reading it?",
];

// ---------------------------------------------------------------------------
// Negative samples (must fail with the named rule)

const NEGATIVE_SAMPLES: Sample[] = [
  {
    label: "negative.em-dash",
    text: "Solid effort today — really strong work.",
    expectViolation: "em-dash",
  },
  {
    label: "negative.exclamation",
    text: "Great session today!",
    expectViolation: "exclamation",
  },
  {
    label: "negative.hype",
    text: "You absolutely crushed that workout.",
    expectViolation: "hype",
  },
  {
    label: "negative.sycophancy",
    text: "Nice work on the tempo.",
    expectViolation: "sycophancy",
  },
  {
    label: "negative.clinical",
    text: "Based on the data, you ran well.",
    expectViolation: "clinical",
  },
  {
    label: "negative.hedge",
    text: "It was basically a recovery run.",
    expectViolation: "hedge",
  },
  {
    label: "negative.markdown-bold",
    text: "**Strong** workout today.",
    expectViolation: "markdown-bold",
  },
  {
    label: "negative.athlete-name-third-person",
    text: "Jason held recovery pace through the back half.",
    athleteName: "Jason",
    expectViolation: "athlete-name-third-person",
  },
  {
    label: "negative.canned-phrase",
    text: "In the four-week arc this lands as a hold week.",
    expectViolation: "canned-phrase",
  },
];

// ---------------------------------------------------------------------------
// Runner

function buildCorpus(): Sample[] {
  const samples: Sample[] = [];

  MOCK_DEBRIEF_BODIES.forEach((text, i) =>
    samples.push({ label: `mock.debrief.${i}`, text }),
  );
  MOCK_FOLLOWUPS.forEach((text, i) =>
    samples.push({ label: `mock.followup.${i}`, text }),
  );
  MOCK_STRAVA_BLURBS.forEach((text, i) =>
    samples.push({ label: `mock.strava-blurb.${i}`, text, profile: "eavesdropping" }),
  );
  MOCK_RPE_BRANCHED.forEach((text, i) =>
    samples.push({ label: `mock.rpe-branched.${i}`, text }),
  );
  MOCK_CHAT.forEach((text, i) =>
    samples.push({ label: `mock.chat.${i}`, text }),
  );
  MOCK_VALIDATION_OBSERVATIONS.forEach((text, i) =>
    samples.push({ label: `mock.validation.${i}`, text }),
  );
  MOCK_RACE_WEEK_BRIEFING.forEach((text, i) =>
    samples.push({ label: `mock.race-week-briefing.${i}`, text }),
  );
  MOCK_FUELING_PRERUN.forEach((text, i) =>
    samples.push({ label: `mock.fueling-prerun.${i}`, text }),
  );
  MOCK_FUELING_RETROSPECTIVE.forEach((text, i) =>
    samples.push({ label: `mock.fueling-retrospective.${i}`, text }),
  );
  MOCK_NIGGLE_ESCALATION.forEach((text, i) =>
    samples.push({ label: `mock.niggle-escalation.${i}`, text }),
  );
  MOCK_MID_BLOCK_FLATNESS.forEach((text, i) =>
    samples.push({ label: `mock.mid-block-flatness.${i}`, text }),
  );

  samples.push(...NEGATIVE_SAMPLES);
  return samples;
}

function run(): void {
  const samples = buildCorpus();
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const s of samples) {
    const result = checkVoice(s.text, {
      profile: s.profile,
      athleteName: s.athleteName,
    });

    if (s.expectViolation) {
      const matched = result.findings.some((f) => f.rule === s.expectViolation);
      if (matched) {
        passed++;
      } else {
        failed++;
        failures.push(
          `[FAIL] ${s.label}: expected violation "${s.expectViolation}" not found.\n` +
            `   text: ${JSON.stringify(s.text.slice(0, 120))}\n` +
            `   findings: ${result.findings.map((f) => f.rule).join(", ") || "(none)"}`,
        );
      }
    } else {
      if (result.ok) {
        passed++;
      } else {
        failed++;
        failures.push(
          `[FAIL] ${s.label}: unexpected violations.\n` +
            `   text: ${JSON.stringify(s.text.slice(0, 160))}\n` +
            `   findings: ${result.findings.map((f) => `${f.rule}:${JSON.stringify(f.match)}`).join(", ")}`,
        );
      }
    }
  }

  console.log(`\nVoice eval: ${passed} passed, ${failed} failed of ${samples.length} samples.\n`);
  for (const line of failures) console.log(line);
  if (failed > 0) process.exit(1);
}

run();
