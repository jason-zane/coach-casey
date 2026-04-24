import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, SONNET_MODEL } from "./anthropic";
import type { Message } from "@/lib/thread/types";

type MemoryItem = { kind: string; content: string; tags: string[] };
type ActivitySummary = {
  date: string;
  name: string | null;
  distance_km: number;
  pace: string;
  hr: number | null;
};

type GoalRace = {
  name: string | null;
  raceDate: string | null;
  goalTimeSeconds: number | null;
};

export type ChatContext = {
  athleteId: string;
  displayName: string | null;
  recentMessages: Message[];
  recentActivities: ActivitySummary[];
  memoryItems: MemoryItem[];
  activePlanText: string | null;
  goalRaces: GoalRace[];
};

export type ChatStreamEvent =
  | { type: "text"; value: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "done"; fullText: string };

const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "remember_context",
    description:
      "Persist life context the athlete has shared — sleep, work pressure, travel, fuelling, stress, or similar. Silent side effect; do not tell the athlete.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Short factual summary of the context, in your own words.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Short lowercase tags e.g. ['sleep', 'work'].",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "remember_injury",
    description:
      "Persist an injury or niggle with the affected body part and a short description. Silent side effect.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Short description of the niggle or injury.",
        },
        body_part: {
          type: "string",
          description: "Affected body part e.g. 'calf', 'left achilles'.",
        },
      },
      required: ["content", "body_part"],
    },
  },
];

let cachedSystemPrompt: string | null = null;
async function loadSystemPrompt(): Promise<string> {
  if (!cachedSystemPrompt) {
    const p = path.join(process.cwd(), "prompts/chat-system.md");
    cachedSystemPrompt = await readFile(p, "utf8");
  }
  return cachedSystemPrompt;
}

function formatPace(secPerKm: number | null | undefined): string {
  if (!secPerKm) return "n/a";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function renderContext(ctx: ChatContext): string {
  const parts: string[] = [];

  parts.push(`# Athlete\n${ctx.displayName ?? "(unnamed)"}`);

  if (ctx.goalRaces.length > 0) {
    const lines = ctx.goalRaces
      .map((r) => {
        const name = r.name ?? "(unnamed race)";
        const date = r.raceDate ?? "date TBD";
        const goal =
          r.goalTimeSeconds != null
            ? (() => {
                const h = Math.floor(r.goalTimeSeconds / 3600);
                const m = Math.floor((r.goalTimeSeconds % 3600) / 60);
                const s = Math.round(r.goalTimeSeconds % 60);
                const mm = String(m).padStart(2, "0");
                const ss = String(s).padStart(2, "0");
                return h > 0 ? `, goal ${h}:${mm}:${ss}` : `, goal ${m}:${ss}`;
              })()
            : "";
        return `- ${name} on ${date}${goal}`;
      })
      .join("\n");
    parts.push(`# Goal races\n${lines}`);
  }

  if (ctx.activePlanText) {
    parts.push(`# Active training plan\n${ctx.activePlanText}`);
  }

  if (ctx.memoryItems.length > 0) {
    const lines = ctx.memoryItems
      .slice(0, 30)
      .map((m) => `- [${m.kind}] ${m.content}${m.tags.length ? ` (${m.tags.join(", ")})` : ""}`)
      .join("\n");
    parts.push(`# Memory items\n${lines}`);
  }

  if (ctx.recentActivities.length > 0) {
    const lines = ctx.recentActivities
      .slice(-14)
      .map(
        (a) =>
          `- ${a.date}: ${a.name ?? "Run"}, ${a.distance_km.toFixed(1)} km, ${a.pace}${a.hr ? `, HR ${a.hr}` : ""}`,
      )
      .join("\n");
    parts.push(`# Recent runs (up to 14)\n${lines}`);
  }

  return parts.join("\n\n");
}

function renderHistory(messages: Message[]): Anthropic.MessageParam[] {
  return messages
    .filter((m) => m.body.trim().length > 0)
    .map<Anthropic.MessageParam>((m) => {
      const role: "user" | "assistant" = m.kind === "chat_user" ? "user" : "assistant";
      // Non-chat Casey messages (debriefs, reviews, follow-ups) are shown to
      // the model as assistant turns so Casey remembers what she's said.
      const prefix =
        m.kind === "debrief" ? "[debrief] " : m.kind === "weekly_review" ? "[weekly review] " : "";
      return { role, content: `${prefix}${m.body}` };
    });
}

function mockMode(): boolean {
  if (process.env.LLM_MODE === "mock") return true;
  if (process.env.LLM_MODE === "real") return false;
  return !process.env.ANTHROPIC_API_KEY;
}

async function* mockStream(userText: string): AsyncGenerator<ChatStreamEvent> {
  const response =
    userText.toLowerCase().includes("calf") || userText.toLowerCase().includes("knee")
      ? "Noted. I'll keep an eye on how that travels through the week. If it's still there on your next easy run, worth easing off the pace for a day or two and seeing if it settles."
      : "Heard. Anything specific on your mind, or just checking in?";
  for (const chunk of response.match(/.{1,20}(\s|$)/g) ?? [response]) {
    yield { type: "text", value: chunk };
    await new Promise((r) => setTimeout(r, 40));
  }
  yield { type: "done", fullText: response };
}

export function summariseActivity(a: {
  start_date_local: string;
  name: string | null;
  distance_m: number | null;
  avg_pace_s_per_km: number | null;
  avg_hr: number | null;
}): ActivitySummary {
  return {
    date: a.start_date_local.slice(0, 10),
    name: a.name,
    distance_km: (a.distance_m ?? 0) / 1000,
    pace: formatPace(a.avg_pace_s_per_km),
    hr: a.avg_hr,
  };
}

/**
 * Streams Casey's reply as an async generator of {type, value} events.
 * Accumulates text + tool-use inputs; the route handler is responsible for
 * executing tool side effects once their input_json is complete.
 */
export async function* streamChat(
  ctx: ChatContext,
  userText: string,
): AsyncGenerator<ChatStreamEvent> {
  if (mockMode()) {
    yield* mockStream(userText);
    return;
  }

  const system = await loadSystemPrompt();
  const contextBlock = renderContext(ctx);
  const history = renderHistory(ctx.recentMessages);

  const stream = anthropic().messages.stream({
    model: SONNET_MODEL,
    max_tokens: 1024,
    system: [
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
      { type: "text", text: contextBlock, cache_control: { type: "ephemeral" } },
    ],
    tools: CHAT_TOOLS,
    messages: [...history, { role: "user", content: userText }],
  });

  let fullText = "";
  // Accumulate tool-use blocks by content_block index.
  const toolBuffers = new Map<number, { name: string; json: string }>();

  for await (const event of stream) {
    if (event.type === "content_block_start") {
      if (event.content_block.type === "tool_use") {
        toolBuffers.set(event.index, { name: event.content_block.name, json: "" });
      }
    } else if (event.type === "content_block_delta") {
      if (event.delta.type === "text_delta") {
        fullText += event.delta.text;
        yield { type: "text", value: event.delta.text };
      } else if (event.delta.type === "input_json_delta") {
        const buf = toolBuffers.get(event.index);
        if (buf) buf.json += event.delta.partial_json;
      }
    } else if (event.type === "content_block_stop") {
      const buf = toolBuffers.get(event.index);
      if (buf) {
        try {
          const input = buf.json ? JSON.parse(buf.json) : {};
          yield { type: "tool_use", name: buf.name, input };
        } catch {
          // Malformed tool input — drop silently.
        }
        toolBuffers.delete(event.index);
      }
    }
  }

  yield { type: "done", fullText };
}
