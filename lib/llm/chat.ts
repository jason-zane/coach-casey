import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, SONNET_MODEL } from "./anthropic";
import {
  renderLapBreakdown,
  type WorkoutClassification,
} from "@/lib/strava/workout-detect";
import type { Message } from "@/lib/thread/types";
import {
  executeFetchRunDetail,
  executeQueryTrainingHistory,
  type FetchRunDetailArgs,
  type QueryHistoryArgs,
} from "./chat-tools";
import {
  renderRollupForPrompt,
  type MonthlyRollupEntry,
} from "@/lib/strava/history-rollup";

type MemoryItem = { kind: string; content: string; tags: string[] };
type ActivitySummary = {
  date: string;
  name: string | null;
  distance_km: number;
  pace: string;
  hr: number | null;
  duration_minutes: number | null;
  workout: WorkoutClassification;
};

type CrossTrainingSummary = {
  date: string;
  activityType: string | null;
  name: string | null;
  durationMinutes: number | null;
  distanceKm: number | null;
  avgHr: number | null;
};

type GoalRace = {
  name: string | null;
  raceDate: string | null;
  goalTimeSeconds: number | null;
};

export type ChatContext = {
  athleteId: string;
  displayName: string | null;
  sex: "M" | "F" | null;
  weightKg: number | null;
  ageYears: number | null;
  /** 'coach' = a human coach is writing the athlete's training; defer to coach intent. 'self' = athlete is self-directed or following a public plan. null = not asked yet. */
  coachingMode: "coach" | "self" | null;
  recentMessages: Message[];
  recentActivities: ActivitySummary[];
  recentCrossTraining: CrossTrainingSummary[];
  memoryItems: MemoryItem[];
  activePlanText: string | null;
  goalRaces: GoalRace[];
  /** Cached per-month rollup for activities older than 12 weeks. Null until the long-history backfill lands. */
  monthlyRollup: MonthlyRollupEntry[] | null;
  /** ISO date of the recent-window boundary. Older than this, Casey only has summaries unless they pull fresh detail. */
  recentBoundaryIso: string;
  /** ISO date of the oldest activity in the DB, used for the detail-availability marker. Null when no history. */
  oldestActivityIso: string | null;
};

export type ChatStreamEvent =
  | { type: "text"; value: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "done"; fullText: string };

const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "remember_context",
    description:
      "Persist life context the athlete has shared, sleep, work pressure, travel, fuelling, stress, or similar. Silent side effect; do not tell the athlete.",
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
  {
    name: "query_training_history",
    description:
      "Look up the athlete's training history from the database for a date range. Use this when the athlete asks about anything older than the recent 12-week window already shown in context, e.g. 'what was my volume last August', 'how did the spring block compare', 'when did I run that half'. No external API call, cheap. Default granularity is week.",
    input_schema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Start date YYYY-MM-DD (inclusive). Defaults to 3 months ago.",
        },
        to: {
          type: "string",
          description: "End date YYYY-MM-DD (inclusive). Defaults to today.",
        },
        granularity: {
          type: "string",
          enum: ["run", "week", "month"],
          description: "How to aggregate: per-run lines, per-week totals, or per-month totals.",
        },
      },
    },
  },
  {
    name: "fetch_run_detail",
    description:
      "Pull lap detail from Strava for a single older run when the athlete asks about workout structure (interval splits, tempo pacing, HR drift). Costs against the daily fetch cap. ONLY use when the answer genuinely needs lap-level data, never for general 'how was that run' questions where a summary is enough. Pass the activity_id returned by query_training_history with granularity='run'.",
    input_schema: {
      type: "object",
      properties: {
        activity_id: {
          type: "string",
          description: "Activity UUID from query_training_history.",
        },
      },
      required: ["activity_id"],
    },
  },
];

const LOOKUP_TOOL_NAMES = new Set(["query_training_history", "fetch_run_detail"]);

let cachedSystemPrompt: string | null = null;
async function loadSystemPrompt(): Promise<string> {
  // In development we always re-read so prompt edits take effect on the next
  // turn without a server restart. In production the file is immutable for
  // the lifetime of the build, so the cache is safe.
  if (process.env.NODE_ENV !== "production") {
    const p = path.join(process.cwd(), "prompts/chat-system.md");
    return readFile(p, "utf8");
  }
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

  const athleteLines: string[] = [];
  athleteLines.push(`Name: ${ctx.displayName ?? "(unnamed)"}`);
  if (ctx.sex) {
    athleteLines.push(`Sex: ${ctx.sex === "M" ? "Male" : "Female"}`);
  }
  if (ctx.ageYears != null) {
    athleteLines.push(`Age: ${ctx.ageYears}`);
  }
  if (ctx.weightKg != null) {
    athleteLines.push(`Weight: ${ctx.weightKg} kg`);
  }
  if (ctx.coachingMode === "coach") {
    athleteLines.push(
      "Coaching: a human coach is writing this athlete's training. Defer to the coach's intent. Help the athlete read what is happening inside the plan rather than offering alternative sessions.",
    );
  } else if (ctx.coachingMode === "self") {
    athleteLines.push(
      "Coaching: self-directed or following a public plan. You can engage more directly with workout choices when the athlete asks for input.",
    );
  }
  parts.push(`# Athlete\n${athleteLines.join("\n")}`);

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
    const lines = ctx.recentActivities.map(renderActivityForPrompt).join("\n");
    parts.push(
      `# Recent runs (last 12 weeks, oldest → newest)\n${lines}`,
    );
  }

  // Long-history rollup: per-month shape of training older than 12 weeks.
  // Only present once the long-history backfill has landed; before that,
  // we omit the section so Casey doesn't claim knowledge they don't have.
  const rollupBlock = renderRollupForPrompt(ctx.monthlyRollup);
  if (rollupBlock) {
    parts.push(`# Long history (summary)\n${rollupBlock}`);
  }

  // Honest "what Casey can see" marker so the model doesn't overclaim.
  // Recent window has full lap detail; long-history rows have summary only,
  // detail must be fetched on demand via the fetch_run_detail tool.
  const recentDate = ctx.recentBoundaryIso.slice(0, 10);
  const availabilityLines = [
    `Lap detail available in context: from ${recentDate} onward (last 12 weeks).`,
  ];
  if (ctx.oldestActivityIso) {
    const oldestDate = ctx.oldestActivityIso.slice(0, 10);
    availabilityLines.push(
      `Summaries only (no lap detail in context) for: ${oldestDate} to ${recentDate}. Use fetch_run_detail to pull laps for a specific older run.`,
    );
  } else {
    availabilityLines.push(
      "No long-history backfill yet, the recent window is all you have.",
    );
  }
  parts.push(`# What you can see\n${availabilityLines.join("\n")}`);

  if (ctx.recentCrossTraining.length > 0) {
    const lines = ctx.recentCrossTraining
      .map((c) => {
        const dur =
          c.durationMinutes != null ? `${c.durationMinutes} min` : "duration n/a";
        const dist =
          c.distanceKm != null && c.distanceKm > 0
            ? `, ${c.distanceKm.toFixed(1)} km`
            : "";
        const hr = c.avgHr ? `, HR ${c.avgHr}` : "";
        const label = c.activityType ?? "session";
        const title = c.name && c.name.trim() ? ` "${c.name.trim()}"` : "";
        return `- ${c.date}: ${label}${title}, ${dur}${dist}${hr}`;
      })
      .join("\n");
    parts.push(
      `# Recent cross-training (last 12 weeks)\n${lines}`,
    );
  }

  return parts.join("\n\n");
}

function renderActivityForPrompt(a: ActivitySummary): string {
  const w = a.workout;
  const dur =
    a.duration_minutes != null ? `, ${formatDuration(a.duration_minutes)}` : "";
  const head = `- ${a.date}: ${a.name ?? "Run"}, ${a.distance_km.toFixed(1)} km, ${a.pace}${dur}${a.hr ? `, HR ${a.hr}` : ""}`;
  const wantsLaps =
    w.kind === "intervals" ||
    w.kind === "tempo" ||
    w.kind === "progression" ||
    w.kind === "race";
  if (!wantsLaps || !w.laps || w.laps.length === 0) return head;
  const tag = `  [${w.kind}] ${w.summary}`;
  return `${head}\n${tag}\n${renderLapBreakdown(w.laps)}`;
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes - h * 60);
    return m > 0 ? `${h}h${m}m` : `${h}h`;
  }
  return `${Math.round(minutes)} min`;
}

function renderHistory(messages: Message[]): Anthropic.MessageParam[] {
  return messages
    .filter((m) => m.body.trim().length > 0)
    .map<Anthropic.MessageParam>((m) => {
      const role: "user" | "assistant" = m.kind === "chat_user" ? "user" : "assistant";
      // Non-chat Casey messages (debriefs, reviews, follow-ups) are shown to
      // the model as assistant turns so Casey remembers what they've said.
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

export function summariseActivity(
  a: {
    start_date_local: string;
    name: string | null;
    distance_m: number | null;
    moving_time_s?: number | null;
    avg_pace_s_per_km: number | null;
    avg_hr: number | null;
  },
  workout: WorkoutClassification,
): ActivitySummary {
  return {
    date: a.start_date_local.slice(0, 10),
    name: a.name,
    distance_km: (a.distance_m ?? 0) / 1000,
    pace: formatPace(a.avg_pace_s_per_km),
    hr: a.avg_hr,
    duration_minutes:
      a.moving_time_s != null ? Math.round(a.moving_time_s / 60) : null,
    workout,
  };
}

/**
 * Strips em-dashes from chat output. The system prompt forbids them but
 * Sonnet still slips one in occasionally; this is the belt-and-braces
 * post-process so the no-em-dash rule is actually enforced. En-dashes
 * inside numeric ranges ("5:05–5:15/km") are explicitly permitted by the
 * style guide, so we only target the wider em-dash glyph.
 */
export function stripEmDashes(text: string): string {
  // U+2014 EM DASH only. Replace with comma + space to preserve sentence flow,
  // collapsing the awkward " — " case down to ", " and the no-space case to
  // a single comma.
  return text
    .replace(/\s*—\s*/g, ", ")
    .replace(/,,/g, ",");
}

/**
 * Streams Casey's reply with full tool-use loop support.
 *
 * Three tool families:
 *   1. Lookup tools (query_training_history, fetch_run_detail) , execute,
 *      append tool_result, model continues with the result in context.
 *   2. Memory tools (remember_context, remember_injury) , fire-and-forget
 *      side effects in the route handler. The model gets an empty ack as
 *      tool_result so the conversation contract holds without exposing
 *      memory state to the prompt.
 *
 * The loop runs at most MAX_TOOL_TURNS turns to prevent runaway tool calls.
 */
const MAX_TOOL_TURNS = 4;

type AssistantBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

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

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: userText },
  ];

  let fullText = "";

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const stream = anthropic().messages.stream({
      model: SONNET_MODEL,
      max_tokens: 1024,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
        { type: "text", text: contextBlock, cache_control: { type: "ephemeral" } },
      ],
      tools: CHAT_TOOLS,
      messages,
    });

    const blocks: AssistantBlock[] = [];
    const toolBuffers = new Map<number, { id: string; name: string; json: string }>();
    let turnTextRaw = "";
    let turnTextEmitted = "";

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          toolBuffers.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            json: "",
          });
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          turnTextRaw += event.delta.text;
          // Stream em-dash-stripped text. Stripping per chunk is fine because
          // em-dashes are single codepoints and never split across deltas.
          const cleaned = stripEmDashes(event.delta.text);
          turnTextEmitted += cleaned;
          yield { type: "text", value: cleaned };
        } else if (event.delta.type === "input_json_delta") {
          const buf = toolBuffers.get(event.index);
          if (buf) buf.json += event.delta.partial_json;
        }
      } else if (event.type === "content_block_stop") {
        const buf = toolBuffers.get(event.index);
        if (buf) {
          try {
            const input = buf.json ? JSON.parse(buf.json) : {};
            blocks.push({ type: "tool_use", id: buf.id, name: buf.name, input });
            yield { type: "tool_use", name: buf.name, input };
          } catch {
            // Malformed tool input, drop silently.
          }
          toolBuffers.delete(event.index);
        }
      }
    }

    if (turnTextRaw.length > 0) {
      // Push the raw text into the assistant turn so subsequent tool_result
      // turns see the model's prose verbatim. The streamed copy to the
      // client was already em-dash-stripped above.
      blocks.unshift({ type: "text", text: turnTextRaw });
      fullText += turnTextEmitted;
    }

    const toolUses = blocks.filter(
      (b): b is Extract<AssistantBlock, { type: "tool_use" }> => b.type === "tool_use",
    );
    const lookupCalls = toolUses.filter((t) => LOOKUP_TOOL_NAMES.has(t.name));

    // Done when the model emits no lookup tool calls. Memory tools can fire
    // as side effects without round-tripping a tool_result.
    if (lookupCalls.length === 0) {
      break;
    }

    // Append assistant turn (text + tool_use blocks) and tool_result blocks
    // for every tool_use the model emitted, lookup OR memory. The model
    // requires a tool_result for every tool_use; memory tools get an empty
    // ack since their side effects run in the route handler.
    messages.push({ role: "assistant", content: blocks });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const t of toolUses) {
      let result = "ok";
      if (t.name === "query_training_history") {
        result = await executeQueryTrainingHistory(
          ctx.athleteId,
          (t.input ?? {}) as QueryHistoryArgs,
        );
      } else if (t.name === "fetch_run_detail") {
        result = await executeFetchRunDetail(
          ctx.athleteId,
          (t.input ?? {}) as FetchRunDetailArgs,
        );
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: t.id,
        content: result,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  yield { type: "done", fullText };
}
