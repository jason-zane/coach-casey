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
  executeLookupActivity,
  executeQueryActivities,
  executeReadRpeHistory,
  executeRefreshActivityFromStrava,
  type LookupActivityArgs,
  type QueryActivitiesArgs,
  type ReadRpeHistoryArgs,
  type RefreshActivityArgs,
} from "./chat-tools";
import {
  renderRollupForPrompt,
  type MonthlyRollupEntry,
} from "@/lib/strava/history-rollup";

type MemoryItem = { kind: string; content: string; tags: string[] };
type ActivitySummary = {
  /** DB UUID, exposed in context so Casey can pass it to lookup tools. */
  id: string;
  date: string;
  name: string | null;
  distance_km: number;
  pace: string;
  hr: number | null;
  maxHr: number | null;
  duration_minutes: number | null;
  workout: WorkoutClassification;
};

type CrossTrainingSummary = {
  /** DB UUID, exposed in context so Casey can pass it to lookup tools. */
  id: string;
  date: string;
  activityType: string | null;
  name: string | null;
  durationMinutes: number | null;
  distanceKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgWatts: number | null;
  maxWatts: number | null;
  sufferScore: number | null;
  /** Lap detail when present, null otherwise. Rides often have lap detail
   *  (auto-laps every km or per climb), so showing it inline avoids a tool
   *  call for "when did the HR hit 188". */
  laps: import("@/lib/strava/client").StravaLap[] | null;
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
    name: "lookup_activity",
    description:
      "Read every detail we have on a single activity from the database, including laps, splits, best efforts, segment efforts, power, cadence, suffer score, temperature, elevation. Works for runs, rides, swims, and any other activity type. This is the default tool when the athlete asks about ONE specific activity beyond what's already rendered in context: 'when did the HR hit 188 on that ride', 'how did the splits go on the long run', 'was there a climb you crushed'. Cheap, DB read only, no rate limit. Pass the activity_id (UUID) shown next to each activity in the rendered context.",
    input_schema: {
      type: "object",
      properties: {
        activity_id: {
          type: "string",
          description: "The activity's UUID, shown as id=... in the rendered context.",
        },
      },
      required: ["activity_id"],
    },
  },
  {
    name: "query_activities",
    description:
      "Read activity history from the database for a date range, optionally filtered by activity type. Use when the athlete asks about training over a span of time: 'what was my running volume in August', 'how much riding have I done this year', 'when was my biggest week'. Cheap, no Strava call. Default granularity is week, default types is ['run']. Pass types=['ride'] for cycling, types=['cross_training'] for gym/swim/yoga, types=['all'] for everything.",
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
        types: {
          type: "array",
          items: { type: "string", enum: ["run", "ride", "cross_training", "all"] },
          description: "Activity types to include. Defaults to ['run']. Use ['all'] for everything.",
        },
        granularity: {
          type: "string",
          enum: ["run", "week", "month"],
          description: "How to aggregate: per-activity lines, per-week totals, or per-month totals.",
        },
      },
    },
  },
  {
    name: "read_rpe_history",
    description:
      "Read the athlete's trailing in-app RPE answers (1-10 effort ratings on individual activities) for a date range, joined with the activity that was rated. Use when the athlete asks about effort patterns: 'have I been pushing too hard lately', 'what's my average RPE this month', 'when did I last rate something a 9'. Cheap, DB read only.",
    input_schema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Start date YYYY-MM-DD. Defaults to 1 month ago.",
        },
        to: {
          type: "string",
          description: "End date YYYY-MM-DD. Defaults to today.",
        },
      },
    },
  },
  {
    name: "refresh_activity_from_strava",
    description:
      "Force-refresh a single activity from Strava because lookup_activity returned incomplete detail. ONLY use as an escape hatch when the DB row is genuinely missing fields you'd expect (e.g. an older activity has no laps and the athlete's question requires them). Counts against a daily cap. For day-to-day questions, lookup_activity is the right tool, not this one.",
    input_schema: {
      type: "object",
      properties: {
        activity_id: {
          type: "string",
          description: "The activity's UUID.",
        },
      },
      required: ["activity_id"],
    },
  },
];

const LOOKUP_TOOL_NAMES = new Set([
  "lookup_activity",
  "query_activities",
  "read_rpe_history",
  "refresh_activity_from_strava",
]);

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

  // Routing rules for Casey. Lead with what's free in context, then name
  // each tool by the question shape it answers. The goal is that Casey
  // never declines to answer when the data is reachable, and never
  // hallucinates because it didn't call a tool it had.
  const recentDate = ctx.recentBoundaryIso.slice(0, 10);
  const availabilityLines: string[] = [];
  availabilityLines.push(
    `Free in context (no tool call needed): full per-activity detail for runs and rides from ${recentDate} onward (the last 12 weeks), including laps where present. Cross-training entries above carry an id=... suffix so you can pass it to lookup_activity if you need more detail.`,
  );
  if (ctx.oldestActivityIso) {
    const oldestDate = ctx.oldestActivityIso.slice(0, 10);
    availabilityLines.push(
      `Free in context: per-month summary of running AND cross-training from ${oldestDate} to ${recentDate}, rendered above as "Long history (summary)". This is real data covering up to two years; reason from it directly.`,
    );
  } else {
    availabilityLines.push(
      "Long-history backfill hasn't completed yet, so the deeper rollup is not yet available.",
    );
  }
  availabilityLines.push(
    "Free in context: the last 30 chat turns and the last 30 memory items, rendered above.",
  );
  availabilityLines.push("");
  availabilityLines.push("Tool routing (default to the cheapest match):");
  availabilityLines.push(
    "  - One specific activity, more detail than rendered: lookup_activity(activity_id). Covers laps, splits, best efforts, segment efforts, power, suffer score, temperature, etc. Works for any activity type. DB read, free.",
  );
  availabilityLines.push(
    "  - Range or aggregate across activities: query_activities(from, to, types?, granularity?). Defaults to runs; pass types=['ride'] or ['all'] for cross-training. DB read, free.",
  );
  availabilityLines.push(
    "  - Trailing RPE patterns: read_rpe_history(from, to). DB read, free.",
  );
  availabilityLines.push(
    "  - DB row genuinely missing detail it should have: refresh_activity_from_strava(activity_id). Counts against a daily cap. Use as a last resort.",
  );
  availabilityLines.push("");
  availabilityLines.push(
    "Decision rule: answer from rendered context first. If not enough, pick the lookup tool by question shape. Never decline to answer when the data is reachable through any of these tools, and never claim 'I don't have that' without trying the right tool first.",
  );
  parts.push(`# What you can see and how to reach more\n${availabilityLines.join("\n")}`);

  if (ctx.recentCrossTraining.length > 0) {
    const lines = ctx.recentCrossTraining
      .map((c) => {
        const dur =
          c.durationMinutes != null ? `${c.durationMinutes} min` : "duration n/a";
        const dist =
          c.distanceKm != null && c.distanceKm > 0
            ? `, ${c.distanceKm.toFixed(1)} km`
            : "";
        const hrParts: string[] = [];
        if (c.avgHr) hrParts.push(`HR ${c.avgHr}`);
        if (c.maxHr) hrParts.push(`max ${c.maxHr}`);
        const hr = hrParts.length ? `, ${hrParts.join("/")}` : "";
        const watts = c.avgWatts
          ? `, ${Math.round(c.avgWatts)} W${c.maxWatts ? `/max ${c.maxWatts}` : ""}`
          : "";
        const suffer = c.sufferScore != null ? `, suffer ${Math.round(c.sufferScore)}` : "";
        const label = c.activityType ?? "session";
        const title = c.name && c.name.trim() ? ` "${c.name.trim()}"` : "";
        const head = `- ${c.date}: ${label}${title}, ${dur}${dist}${hr}${watts}${suffer} (id=${c.id})`;
        // Inline lap breakdown when present so questions like "when did the
        // HR spike on that ride" don't require a tool call.
        if (c.laps && c.laps.length > 0) {
          const lapLines = c.laps.slice(0, 12).map((l) => {
            const lkm = (l.distance ?? 0) / 1000;
            const lhr = l.average_heartrate
              ? `, HR ${Math.round(l.average_heartrate)}`
              : "";
            const lmax = l.max_heartrate
              ? `/max ${Math.round(l.max_heartrate)}`
              : "";
            const lspeed = l.average_speed
              ? `, ${(l.average_speed * 3.6).toFixed(1)} km/h`
              : "";
            return `    L${l.lap_index ?? "?"}: ${lkm.toFixed(2)} km${lspeed}${lhr}${lmax}`;
          });
          const truncated =
            c.laps.length > 12 ? `\n    ... ${c.laps.length - 12} more laps` : "";
          return `${head}\n${lapLines.join("\n")}${truncated}`;
        }
        return head;
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
  const hrPart = a.hr
    ? `, HR ${a.hr}${a.maxHr ? `/max ${a.maxHr}` : ""}`
    : "";
  const head = `- ${a.date}: ${a.name ?? "Run"}, ${a.distance_km.toFixed(1)} km, ${a.pace}${dur}${hrPart} (id=${a.id})`;
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
    id: string;
    start_date_local: string;
    name: string | null;
    distance_m: number | null;
    moving_time_s?: number | null;
    avg_pace_s_per_km: number | null;
    avg_hr: number | null;
    max_hr?: number | null;
  },
  workout: WorkoutClassification,
): ActivitySummary {
  return {
    id: a.id,
    date: a.start_date_local.slice(0, 10),
    name: a.name,
    distance_km: (a.distance_m ?? 0) / 1000,
    pace: formatPace(a.avg_pace_s_per_km),
    hr: a.avg_hr,
    maxHr: a.max_hr ?? null,
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
      if (t.name === "lookup_activity") {
        result = await executeLookupActivity(
          ctx.athleteId,
          (t.input ?? {}) as LookupActivityArgs,
        );
      } else if (t.name === "query_activities") {
        result = await executeQueryActivities(
          ctx.athleteId,
          (t.input ?? {}) as QueryActivitiesArgs,
        );
      } else if (t.name === "read_rpe_history") {
        result = await executeReadRpeHistory(
          ctx.athleteId,
          (t.input ?? {}) as ReadRpeHistoryArgs,
        );
      } else if (t.name === "refresh_activity_from_strava") {
        result = await executeRefreshActivityFromStrava(
          ctx.athleteId,
          (t.input ?? {}) as RefreshActivityArgs,
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
