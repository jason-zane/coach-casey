import type Anthropic from "@anthropic-ai/sdk";
import type { Insight, ProposedInsight } from "./reconcile";

/**
 * Pure construction + parsing for the consolidation call. No `server-only`,
 * no DB, and only a TYPE import of the SDK (stripped at runtime), so this is
 * the single source of truth shared by production (propose.ts) and the
 * insight eval (`scripts/eval-insights.mts`). The eval runs under plain
 * Node, which can't resolve `@/` aliases, so the alias-free split keeps the
 * prompt from drifting between the two.
 */

export const CONSOLIDATION_SYSTEM = `You maintain Coach Casey's read of an athlete: the small set of beliefs Casey carries forward across interactions. You do not write anything the athlete sees. You update a structured memory.

You are given Casey's current insights (with ids) and a new interaction. Decide what should change, and call update_insights with the operations.

The layers:
- profile: durable facts about who this runner is. Change rarely.
- pattern: things Casey has learned about THIS athlete specifically (responds to threshold, under-fuels past 25km, calf flares on speed). These accumulate.
- block: the current training block and its thesis (where they are, the one or two live questions). Shifts over weeks.
- thread: open coaching threads (a niggle being tracked, a question Casey asked, a pattern building). Open and close over interactions.

Discipline, follow it exactly:
- Do not invent. A belief formed from a single data point is confidence "low". Only call something a pattern at "medium" or "high" when the evidence actually repeats. Put the supporting evidence in the evidence field.
- Prefer updating or closing an existing insight (pass its id) over adding a near-duplicate. Reuse ids from the current insights.
- Close a thread when it resolves (op "close"). A niggle that stopped coming up, a question that got answered.
- When a block/profile fact has genuinely changed (new goal race, switched to a coach, new block), op "supersede" the old one (pass its id) and the new value is added.
- Every injury or niggle insight MUST carry the body region as a tag; this is required for recurrence detection, not optional. Tag the region and the side as SEPARATE tags: ["calf", "left"], never ["left calf"], and never the body part in the content alone with no tags. Use "left", "right", or "bilateral" for the side, and omit the side tag when it is not stated. Set event_at to when it started if known. Recurrence of a prior issue is high-signal; surface it.
- If nothing meaningful changed, return an empty operations array. Silence is fine.

Keep content short and in Casey's terms, one clause each. event_at is an ISO date (YYYY-MM-DD).`;

export const UPDATE_INSIGHTS_TOOL: Anthropic.Tool = {
  name: "update_insights",
  description:
    "Record the changes to Casey's maintained read of the athlete after this interaction.",
  input_schema: {
    type: "object",
    properties: {
      operations: {
        type: "array",
        description: "Insight operations. Empty when nothing meaningful changed.",
        items: {
          type: "object",
          properties: {
            op: {
              type: "string",
              enum: ["add", "update", "close", "supersede"],
              description:
                "add a new insight; update/close/supersede an existing one (pass its id).",
            },
            id: {
              type: "string",
              description: "Existing insight id, required for update / close / supersede.",
            },
            layer: { type: "string", enum: ["profile", "pattern", "block", "thread"] },
            content: { type: "string", description: "Short, one clause, in Casey's terms." },
            status: { type: "string", enum: ["live", "resolving", "closed"] },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            tags: {
              type: "array",
              items: { type: "string" },
              description:
                'Lowercase tags. For injuries, tag the body region and side as separate tags, e.g. ["calf", "left"], not ["left calf"].',
            },
            evidence: { type: "string", description: "What supports this belief." },
            event_at: {
              type: "string",
              description: "ISO date (YYYY-MM-DD) when this was true or started.",
            },
          },
          required: ["op", "layer", "content"],
        },
      },
    },
    required: ["operations"],
  },
};

export function renderInsightsForPrompt(insights: Insight[]): string {
  if (insights.length === 0) return "No insights on file yet. This is the first consolidation.";
  const lines = insights.map((i) => {
    const tags = i.tags.length ? ` tags=[${i.tags.join(", ")}]` : "";
    const conf = i.layer === "pattern" ? ` ${i.confidence}` : "";
    const flags = [
      i.status !== "live" ? i.status : null,
      i.recurrence ? "recurring" : null,
      i.hot ? null : "archived",
    ]
      .filter(Boolean)
      .join(", ");
    const flagSuffix = flags ? ` (${flags})` : "";
    return `- [${i.layer}${conf}] id=${i.id}${tags}${flagSuffix}: ${i.content}`;
  });
  return lines.join("\n");
}

type ToolOperation = {
  op?: string;
  id?: string;
  layer?: string;
  content?: string;
  status?: string;
  confidence?: string;
  tags?: unknown;
  evidence?: string;
  event_at?: string;
};

const LAYERS = new Set(["profile", "pattern", "block", "thread"]);
const OPS = new Set(["add", "update", "close", "supersede"]);

/** Validate and normalise the model's tool output into ProposedInsight[]. */
export function coerceOperations(raw: unknown): ProposedInsight[] {
  if (!raw || typeof raw !== "object") return [];
  const ops = (raw as { operations?: unknown }).operations;
  if (!Array.isArray(ops)) return [];
  const out: ProposedInsight[] = [];
  for (const o of ops as ToolOperation[]) {
    if (!o || !OPS.has(o.op ?? "") || !LAYERS.has(o.layer ?? "")) continue;
    if (typeof o.content !== "string" || o.content.trim().length === 0) continue;
    const tags = Array.isArray(o.tags)
      ? (o.tags.filter((t) => typeof t === "string") as string[])
      : undefined;
    out.push({
      op: o.op as ProposedInsight["op"],
      id: o.id ?? null,
      layer: o.layer as ProposedInsight["layer"],
      content: o.content.trim(),
      status: o.status as ProposedInsight["status"] | undefined,
      confidence: o.confidence as ProposedInsight["confidence"] | undefined,
      tags,
      evidence: typeof o.evidence === "string" ? o.evidence : null,
      eventAt: typeof o.event_at === "string" ? o.event_at : null,
    });
  }
  return out;
}

/** Build the Anthropic request for a consolidation. Pure, no client. */
export function buildConsolidationParams(args: {
  existing: Insight[];
  source: string;
  interactionText: string;
  model: string;
}): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: args.model,
    max_tokens: 1200,
    temperature: 0.2,
    system: CONSOLIDATION_SYSTEM,
    tools: [UPDATE_INSIGHTS_TOOL],
    tool_choice: { type: "tool", name: "update_insights" },
    messages: [
      {
        role: "user",
        content: `# Casey's current insights\n${renderInsightsForPrompt(args.existing)}\n\n# New interaction (${args.source})\n${args.interactionText}\n\n# Task\nReconcile the interaction against the current insights and call update_insights.`,
      },
    ],
  };
}

/** Extract the proposed operations from a consolidation response. */
export function extractProposedOps(response: Anthropic.Message): ProposedInsight[] {
  const toolUse = response.content.find(
    (c): c is Anthropic.ToolUseBlock => c.type === "tool_use" && c.name === "update_insights",
  );
  if (!toolUse) return [];
  return coerceOperations(toolUse.input);
}
