import { NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  appendAthleteMessage,
  appendCaseyMessage,
  ensureThread,
} from "@/lib/thread/repository";
import { buildChatContext } from "@/lib/thread/context";
import { streamChat } from "@/lib/llm/chat";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatRequest = { body?: string };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete) {
    return new Response(JSON.stringify({ error: "no athlete" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const json: ChatRequest = await req.json().catch(() => ({}));
  const userText = (json.body ?? "").trim();
  if (!userText) {
    return new Response(JSON.stringify({ error: "empty body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const athleteId = athlete.id as string;
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
            // Lookup tools (query_training_history, fetch_run_detail) are
            // executed inside streamChat's loop and feed their results back
            // to the model directly. Only memory side-effect tools land in
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
      const content = typeof t.input.content === "string" ? t.input.content.trim() : "";
      if (!content) continue;
      const tags = Array.isArray(t.input.tags)
        ? (t.input.tags as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      rows.push({ athlete_id: athleteId, kind: "context", content, tags, source: "chat" });
    } else if (t.name === "remember_injury") {
      const content = typeof t.input.content === "string" ? t.input.content.trim() : "";
      const bodyPart =
        typeof t.input.body_part === "string" ? t.input.body_part.trim() : "";
      if (!content) continue;
      const tags = bodyPart ? [bodyPart.toLowerCase()] : [];
      rows.push({ athlete_id: athleteId, kind: "injury", content, tags, source: "chat" });
    }
  }

  if (rows.length > 0) {
    await admin.from("memory_items").insert(rows);
  }
}
