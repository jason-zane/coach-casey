import type { InsightLayer, ProposedInsight } from "./reconcile";

/**
 * Pure predicates for grading consolidation output in the insight eval.
 * Alias-free and dependency-free so the plain-Node eval runner and the unit
 * tests can both import them.
 */

export function hasLayer(ops: ProposedInsight[], layer: InsightLayer): boolean {
  return ops.some((o) => o.layer === layer);
}

export function hasOp(ops: ProposedInsight[], op: ProposedInsight["op"]): boolean {
  return ops.some((o) => o.op === op);
}

export function tagPresent(ops: ProposedInsight[], tag: string): boolean {
  const t = tag.toLowerCase();
  return ops.some((o) => (o.tags ?? []).some((x) => x.toLowerCase() === t));
}

export function contentMentions(ops: ProposedInsight[], needle: string): boolean {
  const n = needle.toLowerCase();
  return ops.some((o) => o.content.toLowerCase().includes(n));
}
