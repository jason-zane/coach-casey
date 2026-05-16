import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { RUN_TYPES } from "@/lib/strava/activity-types";
import { formatPace } from "@/lib/llm/context-render";

/**
 * Small renderers for the proactive-surface user-message blocks
 * (race-week briefing, fuelling pre-run / retrospective, mid-block
 * flatness). Each surface needs a compact view of the recent training
 * and life context; these helpers produce strings ready to drop into
 * the generator's user message.
 *
 * Kept separate from the heavier `weekly-review-context.ts` / `debrief
 * -context.ts` builders because the proactive surfaces only need a
 * thin slice (last ~14 days of runs, last 14 days of life context).
 */

export async function renderRecentRunsSummary(
  athleteId: string,
  windowDays: number = 14,
): Promise<string> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const { data } = await admin
    .from("activities")
    .select(
      "start_date_local, name, distance_m, moving_time_s, avg_pace_s_per_km, avg_hr",
    )
    .eq("athlete_id", athleteId)
    .in("activity_type", RUN_TYPES as readonly string[] as string[])
    .gte("start_date_local", cutoff)
    .order("start_date_local", { ascending: false });

  type Row = {
    start_date_local: string;
    name: string | null;
    distance_m: number | null;
    moving_time_s: number | null;
    avg_pace_s_per_km: number | null;
    avg_hr: number | null;
  };
  const rows = ((data ?? []) as Row[]) ?? [];
  if (rows.length === 0) return "(no runs in window)";

  const lines = rows.map((r) => {
    const date = r.start_date_local.slice(0, 10);
    const km = ((r.distance_m ?? 0) / 1000).toFixed(1);
    const pace = formatPace(r.avg_pace_s_per_km);
    const hr = r.avg_hr ? `, HR ${r.avg_hr}` : "";
    const name = r.name ? `, ${r.name}` : "";
    return `  - ${date}: ${km} km, ${pace}${hr}${name}`;
  });
  return lines.join("\n");
}

export async function renderRecentLifeContext(
  athleteId: string,
  windowDays: number = 14,
  limit: number = 6,
): Promise<string> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const { data } = await admin
    .from("memory_items")
    .select("content, created_at, tags")
    .eq("athlete_id", athleteId)
    .eq("kind", "context")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);

  type Row = { content: string; created_at: string; tags: string[] | null };
  const rows = ((data ?? []) as Row[]) ?? [];
  if (rows.length === 0) return "(none on file)";
  return rows
    .map(
      (r) =>
        `  - [${r.created_at.slice(0, 10)}] ${r.content}${
          r.tags && r.tags.length ? ` (${r.tags.join(", ")})` : ""
        }`,
    )
    .join("\n");
}

/**
 * Reads coaching_mode from preferences. Returns true when the athlete
 * is coach-led ('coach'), false when self-directed or unknown. The
 * coached-vs-uncoached posture treats null as softer-posture (coached
 * side), so a missing value is fine.
 */
export async function getHasCoach(athleteId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("preferences")
    .select("coaching_mode")
    .eq("athlete_id", athleteId)
    .maybeSingle();
  return (
    (data as { coaching_mode?: "coach" | "self" | null } | null)
      ?.coaching_mode === "coach"
  );
}
