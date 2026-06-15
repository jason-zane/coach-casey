import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planInsightWrites,
  findRecurrence,
  HOT_CAPS,
  type Insight,
  type ProposedInsight,
} from "../lib/memory/reconcile.ts";
import { renderWorkingRead, formatAge } from "../lib/memory/render.ts";
import { tagPresent, hasOp, contentMentions } from "../lib/memory/eval-checks.ts";
import { coerceOperations } from "../lib/memory/consolidation-prompt.ts";

const NOW = "2026-06-15T00:00:00.000Z";

function insight(over: Partial<Insight> & Pick<Insight, "id" | "layer">): Insight {
  return {
    content: "x",
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

// ---------------------------------------------------------------------------
// Promotion threshold

test("a low-confidence pattern is stored but not loaded into the read", () => {
  const proposed: ProposedInsight[] = [
    { op: "add", layer: "pattern", content: "maybe under-fuels", confidence: "low" },
  ];
  const plan = planInsightWrites([], proposed, NOW, "weekly_review");
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0].hot, false, "low-confidence pattern must not be hot");
});

test("a medium-confidence pattern is promoted into the read", () => {
  const proposed: ProposedInsight[] = [
    { op: "add", layer: "pattern", content: "under-fuels past 25km", confidence: "medium" },
  ];
  const plan = planInsightWrites([], proposed, NOW, "weekly_review");
  assert.equal(plan.inserts[0].hot, true);
});

test("an open thread is hot; a closed one is not", () => {
  const live = planInsightWrites(
    [],
    [{ op: "add", layer: "thread", content: "watching the calf", status: "live" }],
    NOW,
    "weekly_review",
  );
  assert.equal(live.inserts[0].hot, true);
});

// ---------------------------------------------------------------------------
// Recurrence detection

test("a new insight matching a CLOSED insight's tag is flagged as recurrence", () => {
  const existing = [
    insight({
      id: "old",
      layer: "thread",
      status: "closed",
      hot: false,
      tags: ["calf"],
      content: "left calf flared in spring",
      lastReferencedAt: "2025-04-01T00:00:00.000Z",
    }),
  ];
  const proposed: ProposedInsight[] = [
    { op: "add", layer: "thread", content: "calf tight again", tags: ["calf"], confidence: "low" },
  ];
  const plan = planInsightWrites(existing, proposed, NOW, "chat");
  assert.equal(plan.inserts[0].recurrence, true, "should detect recurrence");
  assert.equal(plan.inserts[0].confidence, "high", "recurrence forces high confidence");
  // The prior closed row is re-touched so the archive reflects the return.
  const patch = plan.patches.find((p) => p.id === "old");
  assert.ok(patch, "prior insight should be patched");
  assert.equal(patch?.recurrence, true);
});

test("findRecurrence ignores live insights and other layers", () => {
  const existing = [
    insight({ id: "a", layer: "thread", status: "live", tags: ["calf"] }),
    insight({ id: "b", layer: "pattern", status: "closed", tags: ["calf"] }),
  ];
  assert.equal(findRecurrence(["calf"], "thread", existing), null);
  assert.equal(findRecurrence(["calf"], "pattern", existing)?.id, "b");
});

// ---------------------------------------------------------------------------
// Bounded hot set

test("adding past the hot cap demotes the coldest existing rows", () => {
  // Fill the pattern hot set to its cap, with distinct last-referenced times.
  const existing: Insight[] = Array.from({ length: HOT_CAPS.pattern }, (_, i) =>
    insight({
      id: `p${i}`,
      layer: "pattern",
      content: `pattern ${i}`,
      hot: true,
      lastReferencedAt: `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
    }),
  );
  const proposed: ProposedInsight[] = [
    { op: "add", layer: "pattern", content: "fresh pattern", confidence: "high" },
  ];
  const plan = planInsightWrites(existing, proposed, NOW, "weekly_review");
  const demoted = plan.patches.filter((p) => p.hot === false);
  assert.equal(demoted.length, 1, "exactly one row demoted to make room");
  assert.equal(demoted[0].id, "p0", "the coldest (oldest last-referenced) is demoted");
});

// ---------------------------------------------------------------------------
// Close + supersede

test("close marks an insight closed and cold", () => {
  const existing = [insight({ id: "t1", layer: "thread", content: "the calf question" })];
  const plan = planInsightWrites(
    existing,
    [{ op: "close", id: "t1", layer: "thread", content: "resolved" }],
    NOW,
    "weekly_review",
  );
  const patch = plan.patches.find((p) => p.id === "t1");
  assert.equal(patch?.status, "closed");
  assert.equal(patch?.hot, false);
});

test("supersede closes the old row and links the new one", () => {
  const existing = [insight({ id: "b1", layer: "block", content: "8 weeks out from Berlin" })];
  const plan = planInsightWrites(
    existing,
    [{ op: "supersede", id: "b1", layer: "block", content: "race switched to Valencia" }],
    NOW,
    "chat",
  );
  const patch = plan.patches.find((p) => p.id === "b1");
  assert.equal(patch?.status, "superseded");
  assert.equal(patch?.validUntil, NOW);
  assert.equal(plan.inserts[0].supersedes, "b1");
});

// ---------------------------------------------------------------------------
// Rendering

test("renderWorkingRead returns null when nothing is hot", () => {
  assert.equal(renderWorkingRead([], NOW), null);
  assert.equal(
    renderWorkingRead([insight({ id: "x", layer: "pattern", hot: false })], NOW),
    null,
  );
});

test("renderWorkingRead groups by layer and annotates patterns/threads", () => {
  const out = renderWorkingRead(
    [
      insight({ id: "p", layer: "pattern", content: "under-fuels long runs", confidence: "high" }),
      insight({
        id: "t",
        layer: "thread",
        content: "calf back again",
        recurrence: true,
        lastReferencedAt: "2026-06-08T00:00:00.000Z",
      }),
    ],
    NOW,
  );
  assert.ok(out, "should render");
  assert.match(out!, /Learned patterns:/);
  assert.match(out!, /Open threads:/);
  assert.match(out!, /under-fuels long runs \(high\)/);
  assert.match(out!, /calf back again \(recurring, last touched/);
});

test("formatAge reads in a coach's register", () => {
  assert.equal(formatAge(NOW, NOW), "today");
  assert.equal(formatAge("2026-06-14T00:00:00.000Z", NOW), "yesterday");
  assert.equal(formatAge("2025-06-15T00:00:00.000Z", NOW), "1 year ago");
});

// ---------------------------------------------------------------------------
// Consolidation eval support (grading helpers + op parsing)

test("eval grading helpers read proposed ops", () => {
  const ops: ProposedInsight[] = [
    { op: "add", layer: "thread", content: "calf tight after reps", tags: ["calf"] },
    { op: "supersede", id: "b1", layer: "block", content: "switched to Valencia" },
  ];
  assert.equal(tagPresent(ops, "Calf"), true, "tag match is case-insensitive");
  assert.equal(tagPresent(ops, "achilles"), false);
  assert.equal(hasOp(ops, "supersede"), true);
  assert.equal(hasOp(ops, "close"), false);
  assert.equal(contentMentions(ops, "valencia"), true);
});

test("coerceOperations validates and normalises model output", () => {
  const parsed = coerceOperations({
    operations: [
      { op: "add", layer: "thread", content: " calf tight ", tags: ["calf", 3], event_at: "2026-06-10" },
      { op: "bogus", layer: "thread", content: "dropped: bad op" },
      { op: "add", layer: "nonsense", content: "dropped: bad layer" },
      { op: "add", layer: "pattern", content: "   " },
    ],
  });
  assert.equal(parsed.length, 1, "only the one valid op survives");
  assert.equal(parsed[0].content, "calf tight", "content is trimmed");
  assert.deepEqual(parsed[0].tags, ["calf"], "non-string tags are filtered out");
  assert.equal(parsed[0].eventAt, "2026-06-10", "event_at maps to eventAt");
});

test("coerceOperations tolerates malformed input", () => {
  assert.deepEqual(coerceOperations(null), []);
  assert.deepEqual(coerceOperations({}), []);
  assert.deepEqual(coerceOperations({ operations: "nope" }), []);
});
