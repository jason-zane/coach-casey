import { NextRequest } from "next/server";
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

        // Write half of the maintained-read loop for chat. Runs after the
        // user-visible response, on substantive turns only (the athlete
        // shared something memory-worthy, or it was a real exchange), so the
        // read stays current between weekly consolidations. The consolidation
        // call self-guards by returning no-ops when nothing changed, and
        // swallows its own errors; this guard just avoids paying for "ok".
        const capturedMemory = pendingTools.length > 0;
        const substantive =
          capturedMemory || (userText.trim().length >= 40 && text.length > 0);
        if (substantive) {
          await consolidate({
            athleteId,
            source: "chat",
            interactionText: `Athlete said:\n${userText.trim()}\n\nCasey replied:\n${text}`,
          });
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
  const rows: Array<{
    athlete_id: string;
    kind: string;
    content: string;
    tags: string[];
    source: string;
  }> = [];

  for (const t of tools) {
    if (t.name === "remember_context") {
      const content = cleanMemoryContent(t.input.content);
      if (!content) continue;
      const tags = cleanMemoryTags(t.input.tags);
      rows.push({ athlete_id: athleteId, kind: "context", content, tags, source: "chat" });
    } else if (t.name === "remember_injury") {
      const content = cleanMemoryContent(t.input.content);
      const bodyPart = cleanMemoryTag(t.input.body_part);
      if (!content) continue;
      const tags = bodyPart ? [bodyPart] : [];
      rows.push({ athlete_id: athleteId, kind: "injury", content, tags, source: "chat" });
    }
  }

  if (rows.length > 0) {
    await admin.from("memory_items").insert(rows);
    // After a chat-tool memory write that includes an injury, see if
    // the niggle has crossed the escalation threshold and fire the
    // escalation surface if so. Best-effort, never block the chat
    // response on this.
    const hasInjury = rows.some((r) => r.kind === "injury");
    if (hasInjury) {
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
}
