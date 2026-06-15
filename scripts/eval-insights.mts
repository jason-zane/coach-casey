/**
 * Insight (consolidation) eval.
 *
 * The voice eval checks how Casey *talks*; this checks how Casey *remembers*.
 * It runs the real consolidation prompt against a set of scenarios and
 * asserts the proposed insight operations are sensible: a niggle becomes a
 * tagged thread, a recurrence is surfaced, a goal-race change supersedes the
 * block, and a trivial exchange changes nothing.
 *
 * Gated on ANTHROPIC_API_KEY. Without one (or under LLM_MODE=mock) it skips
 * cleanly and exits 0, so offline runs and CI don't pay for or depend on the
 * API. The "does the maintained read actually sharpen Casey over weeks of
 * real data" question is longitudinal and lives in production telemetry;
 * this harness is the per-change quality gate on the consolidation prompt.
 *
 * Run with:  pnpm eval:insights
 */

import type { Insight, ProposedInsight } from "../lib/memory/reconcile.ts";
import { tagPresent, hasOp, contentMentions } from "../lib/memory/eval-checks.ts";
import {
  buildConsolidationParams,
  extractProposedOps,
} from "../lib/memory/consolidation-prompt.ts";

const NOW = "2026-06-16T00:00:00.000Z";

function insight(
  over: Partial<Insight> & Pick<Insight, "id" | "layer" | "content">,
): Insight {
  return {
    status: "live",
    confidence: "medium",
    hot: true,
    tags: [],
    evidence: null,
    eventAt: null,
    recordedAt: NOW,
    lastReferencedAt: NOW,
    recurrence: false,
    ...over,
  };
}

type Scenario = {
  label: string;
  existing: Insight[];
  source: string;
  interactionText: string;
  /** Return null to pass, or a failure reason. */
  check: (ops: ProposedInsight[]) => string | null;
};

const SCENARIOS: Scenario[] = [
  {
    label: "new niggle in chat becomes a tagged thread",
    existing: [],
    source: "chat",
    interactionText:
      "Athlete said:\nLeft calf has been tight since Tuesday's intervals.\n\nCasey replied:\nNoted, I'll keep an eye on how it travels through the week.",
    check: (ops) =>
      tagPresent(ops, "calf") ? null : "expected an insight tagged 'calf'",
  },
  {
    label: "recurrence of a closed niggle is surfaced",
    existing: [
      insight({
        id: "old",
        layer: "thread",
        status: "closed",
        hot: false,
        tags: ["calf"],
        content: "left calf flared in spring on fast work, resolved over 6 weeks",
      }),
    ],
    source: "chat",
    interactionText:
      "Athlete said:\nThe left calf is back, same spot as the spring thing, after today's reps.\n\nCasey replied:\nThat's the spring one again.",
    check: (ops) =>
      tagPresent(ops, "calf") ? null : "expected the calf thread to be re-surfaced",
  },
  {
    label: "goal-race change supersedes the block",
    existing: [
      insight({
        id: "b1",
        layer: "block",
        content: "8 weeks out from Berlin, sub-3 build",
      }),
    ],
    source: "chat",
    interactionText:
      "Athlete said:\nI've pulled out of Berlin, switching to Valencia in December instead.\n\nCasey replied:\nGot it, that reshapes the back half of the block.",
    check: (ops) =>
      hasOp(ops, "supersede") || contentMentions(ops, "valencia")
        ? null
        : "expected the block to be superseded or Valencia recorded",
  },
  {
    label: "a trivial exchange changes nothing",
    existing: [
      insight({
        id: "p1",
        layer: "pattern",
        confidence: "high",
        content: "under-fuels long runs past 25km",
      }),
    ],
    source: "chat",
    interactionText: "Athlete said:\nthanks!\n\nCasey replied:\nAnytime.",
    check: (ops) => (ops.length === 0 ? null : `expected no ops, got ${ops.length}`),
  },
];

const key = process.env.ANTHROPIC_API_KEY;
if (!key || process.env.LLM_MODE === "mock") {
  console.log(
    "eval:insights skipped. Set ANTHROPIC_API_KEY (and not LLM_MODE=mock) to run the live consolidation eval.",
  );
  process.exit(0);
}

// Imported only on the live path: the client pulls in the SDK, which the
// skip path above must not require.
const { anthropic, MODELS } = await import("../lib/llm/anthropic.ts");

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const s of SCENARIOS) {
  try {
    const response = await anthropic().messages.create(
      buildConsolidationParams({
        existing: s.existing,
        source: s.source,
        interactionText: s.interactionText,
        model: MODELS.consolidation,
      }),
    );
    const ops = extractProposedOps(response);
    const reason = s.check(ops);
    if (reason) {
      failed++;
      failures.push(`[FAIL] ${s.label}: ${reason}\n  ops: ${JSON.stringify(ops)}`);
    } else {
      passed++;
    }
  } catch (e) {
    failed++;
    failures.push(`[ERROR] ${s.label}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log(
  `\nInsight eval: ${passed} passed, ${failed} failed of ${SCENARIOS.length} scenarios.`,
);
if (failures.length > 0) {
  console.log("\n" + failures.join("\n\n"));
  process.exit(1);
}
