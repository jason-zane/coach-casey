import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureActivityLapDetail } from "@/lib/strava/lap-detail";
import {
  classifyWorkout,
  renderLapBreakdown,
} from "@/lib/strava/workout-detect";
import type { StravaLap } from "@/lib/strava/client";
import { extractWorkoutType } from "@/lib/strava/ingest";
import { classifyActivityType } from "@/lib/strava/activity-types";

/**
 * Hard daily cap on Strava detail fetches Casey can do for one athlete in
 * one day. Strava's per-token read budget is 100 in 15 minutes / 1000 in a
 * day; this cap keeps a single chat session from exhausting it and leaves
 * headroom for ingest, debriefs, and the long-history backfill.
 */
const DAILY_DETAIL_FETCH_CAP = 10;

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatPace(secPerKm: number | null | undefined): string {
  if (!secPerKm) return "n/a";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

/**
 * Reserve a detail-fetch slot for today. Returns the new count if the cap
 * was honoured, or `null` if the cap is already reached. Implemented as a
 * read-then-write because PostgREST doesn't expose UPDATE ... RETURNING with
 * conditional logic cleanly; the race window is tiny in practice (chat is
 * one turn at a time per athlete) and a stray over-by-one is harmless.
 */
async function reserveDetailFetchSlot(athleteId: string): Promise<number | null> {
  const admin = createAdminClient();
  const today = todayUtcDate();

  const { data: row } = await admin
    .from("athletes")
    .select("detail_fetches_today, detail_fetches_day")
    .eq("id", athleteId)
    .maybeSingle();
  if (!row) return null;

  const r = row as {
    detail_fetches_today: number | null;
    detail_fetches_day: string | null;
  };

  const sameDay = r.detail_fetches_day === today;
  const current = sameDay ? r.detail_fetches_today ?? 0 : 0;
  if (current >= DAILY_DETAIL_FETCH_CAP) return null;

  const next = current + 1;
  await admin
    .from("athletes")
    .update({ detail_fetches_today: next, detail_fetches_day: today })
    .eq("id", athleteId);
  return next;
}

export type QueryHistoryArgs = {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  granularity?: "run" | "week" | "month";
};

/**
 * Read activities from the DB (no Strava call) for a date range. Used by
 * Casey when the athlete asks something specific older than 12 weeks, e.g.
 * "what was my volume in August", "how long did the marathon block run".
 *
 * Granularity:
 *   run    , one line per run (pace + HR + distance)
 *   week   , Sun→Sat aggregates (km, run count, longest)
 *   month  , per-month aggregates (same shape as the prompt rollup)
 *
 * Returns a compact text block intended to be pasted straight back to the
 * model as a tool_result. Keeps token cost predictable.
 */
export async function executeQueryTrainingHistory(
  athleteId: string,
  args: QueryHistoryArgs,
): Promise<string> {
  const admin = createAdminClient();
  const from = args.from ?? defaultFromIso();
  const to = args.to ?? new Date().toISOString().slice(0, 10);
  const granularity = args.granularity ?? "week";

  const { data, error } = await admin
    .from("activities")
    .select(
      "id, start_date_local, name, activity_type, distance_m, moving_time_s, avg_pace_s_per_km, avg_hr, raw",
    )
    .eq("athlete_id", athleteId)
    .gte("start_date_local", `${from}T00:00:00`)
    .lt("start_date_local", `${to}T23:59:59.999`)
    .order("start_date_local", { ascending: true });
  if (error) {
    return `Query failed: ${error.message}`;
  }

  const rows = (data ?? []).filter((r) => {
    const cls = classifyActivityType((r as { activity_type: string | null }).activity_type);
    return cls === "run" || cls === "catch_all";
  }) as Array<{
    id: string;
    start_date_local: string;
    name: string | null;
    activity_type: string | null;
    distance_m: number | null;
    moving_time_s: number | null;
    avg_pace_s_per_km: number | null;
    avg_hr: number | null;
    raw: unknown;
  }>;

  if (rows.length === 0) {
    return `No runs in ${from} to ${to}.`;
  }

  if (granularity === "run") {
    // Cap at 50 runs to keep tool_result tokens bounded; Casey can re-query
    // a narrower range if they need more.
    const lines = rows.slice(0, 50).map((r) => {
      const km = (r.distance_m ?? 0) / 1000;
      const pace = formatPace(r.avg_pace_s_per_km);
      const hr = r.avg_hr ? `, HR ${r.avg_hr}` : "";
      const name = r.name ? ` "${r.name.trim()}"` : "";
      return `- ${r.start_date_local.slice(0, 10)}${name}, ${km.toFixed(1)} km, ${pace}${hr} (id=${r.id})`;
    });
    const truncated = rows.length > 50 ? `\n(+${rows.length - 50} more, narrow the range to see them)` : "";
    return `Runs ${from} to ${to} (${rows.length} total):\n${lines.join("\n")}${truncated}`;
  }

  if (granularity === "month") {
    const buckets = new Map<string, { km: number; n: number; longest: number }>();
    for (const r of rows) {
      const key = r.start_date_local.slice(0, 7);
      const km = (r.distance_m ?? 0) / 1000;
      const e = buckets.get(key) ?? { km: 0, n: 0, longest: 0 };
      e.km += km;
      e.n += 1;
      if (km > e.longest) e.longest = km;
      buckets.set(key, e);
    }
    const lines = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, e]) => `- ${m}: ${Math.round(e.km)} km, ${e.n} runs, longest ${e.longest.toFixed(1)} km`);
    return `Monthly summary ${from} to ${to}:\n${lines.join("\n")}`;
  }

  // week
  const weekBuckets = new Map<string, { km: number; n: number; longest: number }>();
  for (const r of rows) {
    const d = new Date(r.start_date_local);
    // ISO week start (Monday) for stability across locales
    const day = d.getDay();
    const diffToMonday = (day + 6) % 7;
    d.setDate(d.getDate() - diffToMonday);
    const key = d.toISOString().slice(0, 10);
    const km = (r.distance_m ?? 0) / 1000;
    const e = weekBuckets.get(key) ?? { km: 0, n: 0, longest: 0 };
    e.km += km;
    e.n += 1;
    if (km > e.longest) e.longest = km;
    weekBuckets.set(key, e);
  }
  const lines = Array.from(weekBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([w, e]) => `- week of ${w}: ${Math.round(e.km)} km, ${e.n} runs, longest ${e.longest.toFixed(1)} km`);
  return `Weekly summary ${from} to ${to}:\n${lines.join("\n")}`;
}

function defaultFromIso(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

export type FetchRunDetailArgs = { activity_id: string };

/**
 * On-demand Strava detail fetch for one activity. Persists laps to the DB
 * so the next call is free. Capped at DAILY_DETAIL_FETCH_CAP per athlete
 * per UTC day so a curious chat session can't drain the rate-limit budget.
 *
 * Returns a tool_result-ready text block: the lap breakdown in the same
 * shape the chat prompt uses for recent runs, so Casey reads it
 * consistently with everything else in context.
 */
export async function executeFetchRunDetail(
  athleteId: string,
  args: FetchRunDetailArgs,
): Promise<string> {
  if (!args.activity_id || typeof args.activity_id !== "string") {
    return "fetch_run_detail requires activity_id (UUID from query_training_history).";
  }

  const admin = createAdminClient();

  // Verify the activity belongs to this athlete before fetching, prevents
  // a malformed tool input from leaking another athlete's data.
  const { data: ownerRow } = await admin
    .from("activities")
    .select("athlete_id, start_date_local, name, distance_m, moving_time_s, avg_pace_s_per_km, avg_hr, laps")
    .eq("id", args.activity_id)
    .maybeSingle();
  if (!ownerRow) return "Activity not found.";
  const owner = ownerRow as {
    athlete_id: string;
    start_date_local: string;
    name: string | null;
    distance_m: number | null;
    moving_time_s: number | null;
    avg_pace_s_per_km: number | null;
    avg_hr: number | null;
    laps: unknown;
  };
  if (owner.athlete_id !== athleteId) return "Activity not found.";

  const alreadyHasLaps = Array.isArray(owner.laps) && (owner.laps as unknown[]).length > 0;

  if (!alreadyHasLaps) {
    const reserved = await reserveDetailFetchSlot(athleteId);
    if (reserved === null) {
      return `Daily detail fetch limit reached (${DAILY_DETAIL_FETCH_CAP}). Tell the athlete you can't pull fresh detail today and offer to revisit tomorrow.`;
    }
  }

  const result = await ensureActivityLapDetail(args.activity_id);
  if (!result.ok) {
    return `Could not fetch detail for that activity: ${result.reason}.`;
  }

  const rawLaps = result.laps as StravaLap[];
  if (rawLaps.length === 0) {
    return "Activity has no lap data on Strava (likely a manual entry or device without splits).";
  }

  // Re-fetch raw blob to get workout_type for the classifier; the laps update
  // happens inside ensureActivityLapDetail above.
  const { data: refreshed } = await admin
    .from("activities")
    .select("raw")
    .eq("id", args.activity_id)
    .maybeSingle();
  const rawBlob = (refreshed as { raw: unknown } | null)?.raw ?? null;

  const classification = classifyWorkout({
    laps: rawLaps,
    avgPaceSPerKm: owner.avg_pace_s_per_km,
    distanceM: owner.distance_m,
    movingTimeS: owner.moving_time_s,
    stravaWorkoutType: extractWorkoutType(rawBlob),
  });

  const km = (owner.distance_m ?? 0) / 1000;
  const pace = formatPace(owner.avg_pace_s_per_km);
  const hr = owner.avg_hr ? `, HR ${owner.avg_hr}` : "";
  const name = owner.name ? ` "${owner.name.trim()}"` : "";
  const head = `${owner.start_date_local.slice(0, 10)}${name}, ${km.toFixed(1)} km, ${pace}${hr}`;
  const tag = `[${classification.kind}] ${classification.summary}`;
  if (!classification.laps || classification.laps.length === 0) {
    return `${head}\n${tag}\n(no usable lap structure detected)`;
  }
  return `${head}\n${tag}\n${renderLapBreakdown(classification.laps)}`;
}
