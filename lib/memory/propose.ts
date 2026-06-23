import { anthropic, MODELS } from "@/lib/llm/anthropic";
import { logModelUsage } from "@/lib/observability/usage";
import type { Insight, ProposedInsight } from "./reconcile";
import { buildConsolidationParams, extractProposedOps } from "./consolidation-prompt";

/**
 * The model half of the consolidation pass: given Casey's current insights
 * and a new interaction, ask the model what should change and return the
 * proposed operations. The prompt, tool schema, and parsing live in
 * consolidation-prompt.ts (alias-free) so the insight eval can share them;
 * this wrapper just supplies the live client and model. The DB read/write
 * and mock guard live in consolidate.ts.
 */
export async function proposeInsightOps(params: {
  existing: Insight[];
  source: string;
  interactionText: string;
}): Promise<ProposedInsight[]> {
  const response = await anthropic().messages.create(
    buildConsolidationParams({
      existing: params.existing,
      source: params.source,
      interactionText: params.interactionText,
      model: MODELS.consolidation,
    }),
  );
  logModelUsage({
    surface: `consolidation:${params.source}`,
    model: MODELS.consolidation,
    usage: response.usage,
  });
  return extractProposedOps(response);
}
