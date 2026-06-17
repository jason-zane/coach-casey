import { NextRequest, after } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  appendAthleteMessage,
  appendCaseyMessage,
  ensureThread,
} from "@/lib/thread/repository";
import { buildChatContext } from "@/lib/thread/context";
import { streamChat } from "@/lib/llm/chat";
import {
  MAX_CHAT_BODY_CHARS,
  MAX_CHAT_REQUEST_BYTES,
  PayloadTooLargeError,
  cleanMemoryContent,
  cleanMemoryTag,
  cleanMemoryTags,
  isDeclaredPayloadTooLarge,
} from "@/lib/chat/security";
import { consumeChatRateLimit } from "@/lib/chat/rate-limit-db";
import { consolidate } from "@/lib/memory/consolidate";
import { planNiggleWrites } from "@/lib/thread/niggle-dedup";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatRequest = { body?: string };

export async function POST(req: NextRequest) {
  if (isDeclaredPayloadTooLarge(req.headers.get("content-length"))) {
    return jsonError("request too large", 413);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError("unauthorized", 401);
  }

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete) {
    return jsonError("no athlete", 400);
  }

  let json: ChatRequest;
  try {
    const raw = await readLimitedText(req, MAX_CHAT_REQUEST_BYTES);
    const parsed = raw ? JSON.parse(raw) : {};
    json =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as ChatRequest)
        : {};
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return jsonError("request too large", 413);
    }
    return jsonError("invalid json", 400);
  }

  const userText = (json.body ?? "").trim();
  if (!userText) {
    return jsonError("empty body", 400);
  }
  if (userText.length > MAX_CHAT_BODY_CHARS) {
    return jsonError("message too long", 413);
  }

  const athleteId = athlete.id as string;
  const rate = await consumeChatRateLimit(athleteId);
  if (!rate.ok) {
    return jsonError("rate limit exceeded", 429, {
      "retry-after": String(rate.retryAfterSeconds),
    });
  }

  const threadId = await ensureThread(athleteId);
  const userMessage = await appendAthleteMessage(threadId, athleteId, userText);

  const ctx = await buildChatContext(athleteId, threadId);

  // Strip the just-inserted athlete message from context; the streamChat API
  // expects userText to sit alongside history, not in it.
  const ctxForStream = {
    ...ctx,
    recentMessages: ctx.recentMessages.filter((m) => m.id !== userMessage.id),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      // Emit the user-message id immediately so the client can reconcile its
      // optimistic append with the persisted row.
      send({ type: "user_message", id: userMessage.id, created_at: userMessage.created_at });

      const pendingTools: { name: string; input: Record<string, unknown> }[] = [];
      let accumulated = "";

      try {
        for await (const ev of streamChat(ctxForStream, userText)) {
          if (ev.type === "text") {
            accumulated += ev.value;
            send({ type: "text", value: ev.value });
          } else if (ev.type === "tool_use") {
            // Lookup tools (lookup_activity, query_activities,
            // read_rpe_history, refresh_activity_from_strava) are executed
            // inside streamChat's loop and feed their results back to the
            // model directly. Only memory side-effect tools land in
            // pendingTools for post-stream persistence.
            if (ev.name === "remember_context" || ev.name === "remember_injury") {
              pendingTools.push({
                name: ev.name,
                input: ev.input as Record<string, unknown>,
              });
            }
          } else if (ev.type === "done") {
            accumulated = ev.fullText || accumulated;
          }
        }

        const text = accumulated.trim();
        if (text.length > 0) {
          const casey = await appendCaseyMessage(threadId, athleteId, "chat_casey", text);
          send({ type: "casey_message", id: casey.id, created_at: casey.created_at });
        }

        await executeToolEffects(athleteId, pendingTools);
        send({ type: "done" });

        // Write half of the maintained-read loop for chat. Scheduled via
        // after() so it runs AFTER the response is flushed, never holding the
        // stream open or risking the client marking an already-sent message
        // as failed. Fires on substantive turns only (the athlete shared
        // something memory-worthy, or it was a real exchange); consolidate()
        // self-guards on no-op turns and swallows its own errors.
        const capturedMemory = pendingTools.length > 0;
        const substantive =
          capturedMemory || (userText.trim().length >= 40 && text.length > 0);
        if (substantive) {
          const interactionText = `Athlete said:\n${userText.trim()}\n\nCasey replied:\n${text}`;
          try {
            after(() => consolidate({ athleteId, source: "chat", interactionText }));
          } catch {
            // after() unavailable in this context: skip post-response
            // consolidation rather than disturb the already-sent response.
            // The weekly consolidation still folds this turn in later.
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}

function jsonError(
  error: string,
  status: number,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

async function readLimitedText(
  req: NextRequest,
  maxBytes: number,
): Promise<string> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function executeToolEffects(
  athleteId: string,
  tools: { name: string; input: Record<string, unknown> }[],
) {
  if (tools.length === 0) return;
  const admin = createAdminClient();

  type Row = {
    athlete_id: string;
    kind: string;
    content: string;
    tags: string[];
    source: string;
  };
  const contextRows: Row[] = [];
  // One niggle per body part per day. Casey re-mentions the same niggle
  // across a conversation, so a turn (or a whole day) that touches the calf
  // several times used to stack several rows, showing as several niggles AND
  // inflating the escalation counter (which reads each row as a "mention").
  // planNiggleWrites collapses this turn's injuries by normalised body part
  // and folds them into an existing same-part niggle from today (update)
  // instead of duplicating. Separate days still create separate rows, the
  // genuine recurrence signal the escalation counter is built on.
  const injuryCalls: Array<{ content: string; tag: string }> = [];

  for (const t of tools) {
    if (t.name === "remember_context") {
      const content = cleanMemoryContent(t.input.content);
      if (!content) continue;
      const tags = cleanMemoryTags(t.input.tags);
      contextRows.push({ athlete_id: athleteId, kind: "context", content, tags, source: "chat" });
    } else if (t.name === "remember_injury") {
      const content = cleanMemoryContent(t.input.content);
      const tag = cleanMemoryTag(t.input.body_part);
      if (!content || !tag) continue;
      injuryCalls.push({ content, tag });
    }
  }

  const injuryInsertRows: Row[] = [];
  if (injuryCalls.length > 0) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { data: today } = await admin
      .from("memory_items")
      .select("id, tags")
      .eq("athlete_id", athleteId)
      .eq("kind", "injury")
      .gte("created_at", startOfDay.toISOString())
      .order("created_at", { ascending: false });

    const existingToday = ((today ?? []) as { id: string; tags: string[] | null }[]).map(
      (r) => ({ id: r.id, tags: r.tags ?? [] }),
    );
    const plan = planNiggleWrites(injuryCalls, existingToday);

    for (const { id, content } of plan.updates) {
      await admin.from("memory_items").update({ content }).eq("id", id);
    }
    for (const { content, tag } of plan.inserts) {
      injuryInsertRows.push({
        athlete_id: athleteId,
        kind: "injury",
        content,
        tags: [tag],
        source: "chat",
      });
    }
  }

  const insertRows = [...contextRows, ...injuryInsertRows];
  if (insertRows.length > 0) {
    await admin.from("memory_items").insert(insertRows);
  }

  // Only a genuinely new niggle row (a new mention occasion) can move the
  // escalation count; a same-day update of an existing niggle cannot. Fire the
  // check only when we inserted an injury. Best-effort, never blocks the reply.
  if (injuryInsertRows.length > 0) {
    try {
      const { maybeFireNiggleEscalation } = await import(
        "@/lib/thread/niggle-counter"
      );
      await maybeFireNiggleEscalation(athleteId);
    } catch (err) {
      console.warn("niggle escalation check failed", err);
    }
  }
}
