import "server-only";
import { mockMode } from "@/lib/llm/mocks";
import {
  fetchInsightsForConsolidation,
  applyInsightWrites,
} from "./insights";
import { planInsightWrites } from "./reconcile";
import { proposeInsightOps } from "./propose";

/**
 * The consolidation pass: the write half of the maintained-read loop. After
 * an interaction (a weekly review, a debrief, a chat that went somewhere),
 * it reads Casey's current insights, asks the model what changed
 * (proposeInsightOps), reconciles the proposal into bounded, disciplined
 * writes (planInsightWrites), and applies them.
 *
 * Best-effort throughout: any failure is logged and swallowed. Consolidation
 * never blocks or fails the interaction that triggered it.
 */

export type ConsolidationSource = "weekly_review" | "debrief" | "chat" | "manual";

export async function consolidate(params: {
  athleteId: string;
  source: ConsolidationSource;
  /** A compact description of the interaction that just happened. */
  interactionText: string;
  nowIso?: string;
}): Promise<{ inserts: number; patches: number } | null> {
  if (mockMode()) return null;
  const nowIso = params.nowIso ?? new Date().toISOString();

  try {
    const existing = await fetchInsightsForConsolidation(params.athleteId);
    const proposed = await proposeInsightOps({
      existing,
      source: params.source,
      interactionText: params.interactionText,
    });
    if (proposed.length === 0) return { inserts: 0, patches: 0 };

    const plan = planInsightWrites(existing, proposed, nowIso, params.source);
    await applyInsightWrites(params.athleteId, plan, nowIso);
    return { inserts: plan.inserts.length, patches: plan.patches.length };
  } catch (err) {
    console.warn("[consolidate] failed", {
      athleteId: params.athleteId,
      source: params.source,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
