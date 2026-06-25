import { tagRegions } from "./reconcile.ts";
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

/** Like tagPresent, but matches the body REGION even when the model fused the
 *  side into the tag ("left calf" still counts as region "calf"). Use this for
 *  injury/niggle grading so a fused tag is not a false failure. */
export function regionPresent(ops: ProposedInsight[], region: string): boolean {
  const r = region.toLowerCase();
  return ops.some((o) => tagRegions(o.tags ?? []).includes(r));
}

export function contentMentions(ops: ProposedInsight[], needle: string): boolean {
  const n = needle.toLowerCase();
  return ops.some((o) => o.content.toLowerCase().includes(n));
}
