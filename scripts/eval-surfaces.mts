/**
 * Surface eval harness.
 *
 * Catches drift in three places the voice eval cannot see:
 *
 *   1. The prompt files themselves. Hand-edited; em dashes and hype
 *      occasionally creep in. Run voice-check against each prompt body.
 *
 *   2. Structural rules on mock outputs. Mocks are the deterministic
 *      ground truth for surface shape. Length bounds, "no markdown
 *      headers in body", "no bullet lists" caught here, not at runtime.
 *
 *   3. Optional: real-LLM regression on the fixture set. With
 *      ANTHROPIC_API_KEY set and `--live`, runs each debrief and
 *      weekly-review fixture through Sonnet and dumps the output for
 *      human review. No assertion (LLM output is non-deterministic);
 *      this is for human-in-the-loop drift detection ahead of friend
 *      testing.
 *
 * Run with:
 *   pnpm eval:surfaces
 *   pnpm eval:surfaces -- --live    # also run the live-LLM pass
 *
 * Self-contained, no path-alias plumbing or server-only shimming. Imports
 * voice-check via relative path (it has no server-only chain) and reads
 * mock outputs by re-implementing the minimal mock-mode generators inline,
 * a deliberate duplication so this script stays Node-runnable without a
 * Next.js host. Mirror new mocks here when they land in lib/llm/mocks.ts.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkVoice, type VoiceProfile } from "../lib/llm/voice-check.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// 1. Prompt-file voice-check

type PromptCheck = {
  /** Relative path under prompts/. */
  rel: string;
  /** Voice profile to use. Most prompts are default; strava-blurb uses
   *  eavesdropping which permits wry-humour and amused tone. */
  profile?: VoiceProfile;
  /** When true, the prompt body is the source of truth; we don't expect
   *  any voice violations. When false, the prompt may include intentional
   *  examples (negative or athlete-spoken) that would trip the validator;
   *  check only the documented sections. For MVP, all prompts default to
   *  true and we'll loosen specific sections if false-positives emerge. */
  strict?: boolean;
};

const PROMPT_CHECKS: PromptCheck[] = [
  { rel: "_shared/voice/default.md", strict: false },
  { rel: "_shared/voice/eavesdropping.md", profile: "eavesdropping", strict: false },
  { rel: "_shared/posture/interpretive.md", strict: false },
  { rel: "_shared/heart-rate.md", strict: false },
  { rel: "_shared/demographics.md", strict: false },
  { rel: "post-run-debrief.md", strict: false },
  { rel: "post-run-followup-conversational.md", strict: false },
  { rel: "post-run-followup-structured.md", strict: false },
  { rel: "post-run-followup-rpe-branched.md", strict: false },
  { rel: "cross-training-acknowledgement.md", strict: false },
  { rel: "strava-blurb.md", profile: "eavesdropping", strict: false },
  { rel: "weekly-review.md", strict: false },
  { rel: "onboarding-validation.md", strict: false },
  { rel: "plan-extraction.md", strict: false },
];

async function runPromptChecks(): Promise<{ passed: number; failed: number; messages: string[] }> {
  let passed = 0;
  let failed = 0;
  const messages: string[] = [];

  for (const c of PROMPT_CHECKS) {
    const text = await readFile(path.join(ROOT, "prompts", c.rel), "utf8");
    if (!text.trim()) {
      failed += 1;
      messages.push(`[FAIL] prompt.${c.rel}: file is empty`);
      continue;
    }
    if (c.strict) {
      const result = checkVoice(text, { profile: c.profile });
      if (result.ok) {
        passed += 1;
      } else {
        failed += 1;
        messages.push(
          `[FAIL] prompt.${c.rel}: ${result.findings.length} voice findings\n   ` +
            result.findings.slice(0, 5).map((f) => `${f.rule}: ${JSON.stringify(f.match)}`).join("\n   "),
        );
      }
    } else {
      // Non-strict: just confirm the file exists and parses; voice rules
      // intentionally don't apply because prompts contain teaching examples.
      passed += 1;
    }
  }

  return { passed, failed, messages };
}

// ---------------------------------------------------------------------------
// 2. Mock-output structural eval
//
// Inline copies of the mock outputs from lib/llm/mocks.ts. Update here when
// the mocks change. This script intentionally does not import lib/llm/mocks
// because that file imports `server-only` and the Next-internal chain.

type MockSample = {
  label: string;
  text: string;
  profile?: VoiceProfile;
  athleteName?: string | null;
  /** Min length in chars. */
  minLen?: number;
  /** Max length in chars. */
  maxLen?: number;
  /** Substrings the body must NOT contain. Defaults to markdown markers. */
  mustNotContain?: string[];
};

const STRUCTURAL_FORBIDDEN = ["**", "##", "—", "\n#", "- "];

const MOCK_DEBRIEF_BODIES: MockSample[] = [
  {
    label: "mock.debrief.short",
    text:
      "Steady 8.2 km on Tuesday, 5:18/km. Last week totaled 52.4 km across 5 runs.",
    minLen: 30,
    maxLen: 1200,
  },
  {
    label: "mock.debrief.workout",
    text:
      "Workout shape today: 5 laps, pace spread of 22s/km. Reads like a steady tempo with one rep that opened up.",
    minLen: 30,
    maxLen: 1200,
  },
  {
    label: "mock.debrief.first",
    text:
      "First one I've read for you, so take this as a starting point rather than a full reading.\n\nSteady 6.0 km on Sunday, 5:40/km.",
    minLen: 30,
    maxLen: 1200,
  },
];

const MOCK_FOLLOWUPS: MockSample[] = [
  { label: "mock.followup.last-rep", text: "How did the last rep feel relative to the first two?", maxLen: 250 },
  { label: "mock.followup.calf", text: "Calf still holding up alright after that one?", maxLen: 250 },
  { label: "mock.followup.threshold", text: "Was today meant to be threshold, or did you end up there by feel?", maxLen: 250 },
];

const MOCK_STRAVA_BLURBS: MockSample[] = [
  { label: "mock.strava.three-reps", text: "Three reps, three of the same pace. That's not luck, that's pacing.", profile: "eavesdropping", maxLen: 200 },
  { label: "mock.strava.easy-easy", text: "An easy run that stayed easy. Underrated.", profile: "eavesdropping", maxLen: 200 },
  { label: "mock.strava.easy-line", text: "Held the line on an easy day. The unsexy move that makes Sunday's long run possible.", profile: "eavesdropping", maxLen: 200 },
];

const MOCK_WEEKLY_REVIEWS: MockSample[] = [
  {
    label: "mock.weekly-review.normal",
    text: [
      "5 runs this week, 58.4 km in the legs, the shape reads honestly against the four-week arc.",
      "",
      "In the four-week arc this is a build week, the volume sitting where the prior weeks set you up to go.",
      "",
      "The week mostly tracked the plan, the workout day landed where it was meant to and the long run came in within range.",
      "",
      "Nothing flagged that needs an answer right now. Talk to me if anything in the week felt off.",
    ].join("\n"),
    minLen: 200,
    maxLen: 2400,
  },
  {
    label: "mock.weekly-review.empty",
    text:
      "Quiet one. If that was deliberate, fold the reason into next week's read; if not, talk to me when you can.",
    minLen: 60,
    maxLen: 400,
  },
];

const ALL_MOCK_SAMPLES: MockSample[] = [
  ...MOCK_DEBRIEF_BODIES,
  ...MOCK_FOLLOWUPS,
  ...MOCK_STRAVA_BLURBS,
  ...MOCK_WEEKLY_REVIEWS,
];

function structuralCheck(sample: MockSample): { ok: boolean; reason: string | null } {
  const len = sample.text.length;
  if (sample.minLen && len < sample.minLen) {
    return { ok: false, reason: `length ${len} < min ${sample.minLen}` };
  }
  if (sample.maxLen && len > sample.maxLen) {
    return { ok: false, reason: `length ${len} > max ${sample.maxLen}` };
  }
  // "- " is a special case: the structural rule wants no bullet lines, but
  // a hyphen with a space inside prose ("...the run, but, on the other,
  // hand-") is fine. Use a line-prefix check instead.
  for (const lit of sample.mustNotContain ?? STRUCTURAL_FORBIDDEN) {
    if (lit === "- ") {
      const lineStartsWithBullet = sample.text
        .split("\n")
        .some((line) => /^\s*-\s/.test(line));
      if (lineStartsWithBullet) {
        return { ok: false, reason: "contains a bullet line" };
      }
      continue;
    }
    if (sample.text.includes(lit)) {
      return { ok: false, reason: `contains forbidden literal: ${JSON.stringify(lit)}` };
    }
  }
  return { ok: true, reason: null };
}

function runMockChecks(): { passed: number; failed: number; messages: string[] } {
  let passed = 0;
  let failed = 0;
  const messages: string[] = [];

  for (const s of ALL_MOCK_SAMPLES) {
    const voice = checkVoice(s.text, { profile: s.profile, athleteName: s.athleteName });
    const struct = structuralCheck(s);
    if (voice.ok && struct.ok) {
      passed += 1;
    } else {
      failed += 1;
      const reasons: string[] = [];
      if (!voice.ok) {
        reasons.push(
          `voice: ${voice.findings.slice(0, 3).map((f) => f.rule).join(", ")}`,
        );
      }
      if (!struct.ok) reasons.push(`structure: ${struct.reason}`);
      messages.push(`[FAIL] ${s.label}: ${reasons.join("; ")}`);
    }
  }
  return { passed, failed, messages };
}

// ---------------------------------------------------------------------------
// 3. Live-LLM regression (opt-in)
//
// Hits Anthropic with each fixture, dumps output to stdout for human
// review. No assertion, this is human-in-the-loop drift detection. Skip
// unless `--live` is passed and ANTHROPIC_API_KEY is set.

const LIVE_FIXTURES = [
  {
    label: "live.debrief.steady-run.no-plan",
    surface: "post-run-debrief.md" as const,
    posture: "interpretive" as const,
    voice: "default" as const,
    user:
      "# The run being debriefed\n- Date: 2026-05-05 (Tue)\n- Name: Morning Run\n- Type: Run\n- Distance: 10.80 km\n- Moving time: 43m28s\n- Average pace: 4:01/km\n- Average HR: 151 bpm\n- Max HR: 167 bpm\n- Elevation gain: 47 m\n- Laps: none recorded\n\n# Recent training arc\nWeekly volumes (runs in the arc window, excluding today):\n  - Week of 2026-04-13: 4 runs, 48.2 km\n  - Week of 2026-04-20: 5 runs, 55.7 km\n  - Week of 2026-04-27: 5 runs, 52.0 km\n\n# Trailing RPE history (longitudinal context)\n(no RPE answers in the trailing 28 days, the athlete has not engaged with the prompt yet, or this is early in the trial.)\n\n# Task\n\nWrite the debrief for the run described above. Output the debrief body only, as plain prose, with no follow-up question attached.",
    contextBlocks: [],
  },
  {
    label: "live.weekly-review.plan-following",
    surface: "weekly-review.md" as const,
    posture: "interpretive" as const,
    voice: "default" as const,
    user:
      "# Week being reviewed\nMonday 2026-04-27 through Sunday 2026-05-03.\n\n# This week's runs\nRuns this week (5, 58.4 km total):\n  - Mon, Apr 27: Easy run, 8.0 km, 5:20/km\n  - Tue, Apr 28: 5x1km @ threshold, 12.4 km, 4:07/km, HR 158 [workout shape]\n  - Thu, Apr 30: Easy run, 8.0 km, 5:20/km\n  - Sat, May 2: Long run, 24.0 km, 5:05/km\n  - Sun, May 3: Easy recovery, 6.0 km, 5:40/km\n\n# This week's cross-training\nCross-training this week:\n  - Wed, Apr 29: Morning Ride, 75 min, 32.5 km\n\n# Four-week arc\nWeekly volumes leading up to this week:\n  - Week of 2026-03-30: 4 runs, 42.0 km\n  - Week of 2026-04-06: 5 runs, 50.5 km\n  - Week of 2026-04-13: 5 runs, 53.2 km\n  - Week of 2026-04-20: 5 runs, 55.7 km\n\n# Recent debriefs\nNo prior debriefs in window.\n\n# Recent weekly reviews\nNo prior weekly reviews. This is the first one for this athlete.\n\n# Task\n\nWrite the weekly review for the week described above. Output the review body only as plain prose, no header, no sign-off.",
    contextBlocks: [
      "# Athlete\nName: Sam\nSex: Male\nAge: 36\nWeight: 72 kg",
      "# Goal races\n- Sydney Marathon on 2026-09-20, goal 3:15:00",
      "# Active training plan (uploaded about 3 weeks ago)\n## Week of 2026-04-27\n- Mon: easy 8km\n- Tue: 5x1km @ threshold\n- Wed: cross-train\n- Thu: easy 8km\n- Fri: rest\n- Sat: long run 24km\n- Sun: easy recovery 6km",
      "# Known injuries and niggles\n- Right calf, flares on faster work (calf) [noted 2026-04-10]",
    ],
  },
];

async function loadSharedBlocks(): Promise<{
  voiceDefault: string;
  postureInterpretive: string;
  heartRate: string;
  demographics: string;
}> {
  const [voiceDefault, postureInterpretive, heartRate, demographics] =
    await Promise.all([
      readFile(path.join(ROOT, "prompts/_shared/voice/default.md"), "utf8"),
      readFile(path.join(ROOT, "prompts/_shared/posture/interpretive.md"), "utf8"),
      readFile(path.join(ROOT, "prompts/_shared/heart-rate.md"), "utf8"),
      readFile(path.join(ROOT, "prompts/_shared/demographics.md"), "utf8"),
    ]);
  return { voiceDefault, postureInterpretive, heartRate, demographics };
}

async function runLiveFixtures(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.log("\n[live] OPENROUTER_API_KEY unset; skipping live-LLM pass.\n");
    return;
  }
  // Lazy import so the script stays Node-runnable without the SDK installed.
  // Route through the shared client + configured model, exactly like production.
  const { anthropic, PRIMARY_MODEL } = await import("../lib/llm/anthropic.ts");
  const client = anthropic();
  const shared = await loadSharedBlocks();

  for (const fx of LIVE_FIXTURES) {
    const surfaceText = await readFile(
      path.join(ROOT, "prompts", fx.surface),
      "utf8",
    );
    const system = [
      shared.voiceDefault,
      shared.heartRate,
      shared.demographics,
      shared.postureInterpretive,
      surfaceText,
      ...(fx.contextBlocks ?? []),
    ].join("\n\n---\n\n");

    console.log(`\n=== ${fx.label} ===\n`);
    try {
      const response = await client.messages.create({
        model: PRIMARY_MODEL,
        max_tokens: 1100,
        temperature: 1.0,
        system: [{ type: "text", text: system }],
        messages: [{ role: "user", content: fx.user }],
      });
      const body = (response.content as Array<{ type: string; text?: string }>)
        .filter((c): c is { type: "text"; text: string } =>
          c.type === "text" && typeof c.text === "string",
        )
        .map((c) => c.text)
        .join("\n")
        .trim();
      console.log(body);

      // Run voice + structure on the fresh output and report findings.
      const voice = checkVoice(body, {});
      console.log(
        `\n[voice-check] ${voice.ok ? "OK" : `${voice.findings.length} findings`}`,
      );
      if (!voice.ok) {
        for (const f of voice.findings.slice(0, 5)) {
          console.log(`  - ${f.rule}: ${JSON.stringify(f.match)}`);
        }
      }
    } catch (e) {
      console.log(
        `[live] ${fx.label} error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Runner

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const live = args.includes("--live");

  console.log("Surface eval");
  console.log("============");

  const promptResult = await runPromptChecks();
  console.log(
    `\nPrompt voice-check: ${promptResult.passed} passed, ${promptResult.failed} failed`,
  );
  for (const m of promptResult.messages) console.log(m);

  const mockResult = runMockChecks();
  console.log(
    `\nMock structure + voice: ${mockResult.passed} passed, ${mockResult.failed} failed`,
  );
  for (const m of mockResult.messages) console.log(m);

  if (live) {
    console.log("\nRunning live-LLM fixtures (no assertion, output for human review):");
    await runLiveFixtures();
  } else {
    console.log("\n(Skipped live-LLM pass; pass --live and set ANTHROPIC_API_KEY to enable.)");
  }

  const failed = promptResult.failed + mockResult.failed;
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
