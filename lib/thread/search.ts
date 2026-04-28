import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MessageKind } from "./types";

export type SearchResult = {
  kind: "message" | "activity";
  id: string;
  messageKind?: MessageKind;
  body: string;
  createdAt: string;
  snippet: string;
};

/**
 * V1 text-match search. Postgres FTS over message bodies and activity
 * names/notes. Returns up to `limit` results ordered by recency. Semantic
 * search lives in V1.1 once embeddings backfill is ready.
 */
export async function searchThread(
  threadId: string,
  athleteId: string,
  query: string,
  { limit = 40 }: { limit?: number } = {},
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const supabase = await createClient();
  const tsQuery = q
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => term.replace(/[:'&|!()<>*]/g, ""))
    .filter(Boolean)
    .map((term) => `${term}:*`)
    .join(" & ");

  if (!tsQuery) return [];

  // Match on tsvector for messages.
  const messagesPromise = supabase
    .from("messages")
    .select("id, kind, body, created_at")
    .eq("thread_id", threadId)
    .textSearch("search_tsv", tsQuery, { config: "simple" })
    .order("created_at", { ascending: false })
    .limit(limit);

  // Match activity names/notes via ilike, no FTS column there yet and
  // activity names are short enough that pattern match is fine.
  const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;
  const activitiesPromise = supabase
    .from("activities")
    .select("id, name, start_date_local")
    .eq("athlete_id", athleteId)
    .ilike("name", pattern)
    .order("start_date_local", { ascending: false })
    .limit(limit);

  const [{ data: msgRows }, { data: actRows }] = await Promise.all([
    messagesPromise,
    activitiesPromise,
  ]);

  const results: SearchResult[] = [];

  for (const row of msgRows ?? []) {
    const body = (row.body as string) ?? "";
    results.push({
      kind: "message",
      id: row.id as string,
      messageKind: row.kind as MessageKind,
      body,
      createdAt: row.created_at as string,
      snippet: snippetAround(body, q),
    });
  }

  for (const row of actRows ?? []) {
    const name = (row.name as string) ?? "Run";
    results.push({
      kind: "activity",
      id: row.id as string,
      body: name,
      createdAt: row.start_date_local as string,
      snippet: name,
    });
  }

  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return results.slice(0, limit);
}

function snippetAround(body: string, query: string): string {
  const needle = query.toLowerCase();
  const idx = body.toLowerCase().indexOf(needle);
  if (idx === -1) return body.slice(0, 140);
  const start = Math.max(0, idx - 40);
  const end = Math.min(body.length, idx + needle.length + 100);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < body.length ? "…" : "";
  return `${prefix}${body.slice(start, end)}${suffix}`;
}
