import "server-only";
import { formatPace } from "./context-render";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureActivityLapDetail } from "@/lib/strava/lap-detail";
import { classifyActivityType } from "@/lib/strava/activity-types";
import type {
  StravaLap,
  StravaSplit,
  StravaBestEffort,
  StravaSegmentEffort,
} from "@/lib/strava/client";

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

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "n/a";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function formatSpeedKmh(mPerS: number | null | undefined): string {
  if (!mPerS) return "n/a";
  return `${(mPerS * 3.6).toFixed(1)} km/h`;
}

/**
 * Reserve a detail-fetch slot for today. Returns the new count if the cap
 * was honoured, or `null` if the cap is already reached.
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

// =============================================================================
// lookup_activity — DB read of a single activity by id
// =============================================================================

export type LookupActivityArgs = { activity_id: string };

type ActivityRow = {
  id: string;
  athlete_id: string;
  strava_id: number | null;
  start_date_local: string;
  timezone: string | null;
  utc_offset: number | null;
  location_city: string | null;
  description: string | null;
  name: string | null;
  activity_type: string | null;
  distance_m: number | null;
  moving_time_s: number | null;
  elapsed_time_s: number | null;
  avg_pace_s_per_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_watts: number | null;
  max_watts: number | null;
  weighted_avg_watts: number | null;
  kilojoules: number | null;
  device_watts: boolean | null;
  avg_cadence: number | null;
  avg_speed_m_s: number | null;
  max_speed_m_s: number | null;
  suffer_score: number | null;
  avg_temp_c: number | null;
  elevation_gain_m: number | null;
  elev_high_m: number | null;
  elev_low_m: number | null;
  is_manual: boolean | null;
  is_trainer: boolean | null;
  is_commute: boolean | null;
  laps: unknown;
  splits_metric: unknown;
  splits_standard: unknown;
  best_efforts: unknown;
  segment_efforts: unknown;
};

const ACTIVITY_LOOKUP_COLUMNS =
  "id, athlete_id, strava_id, start_date_local, timezone, utc_offset, location_city, description, name, activity_type, distance_m, moving_time_s, elapsed_time_s, avg_pace_s_per_km, avg_hr, max_hr, avg_watts, max_watts, weighted_avg_watts, kilojoules, device_watts, avg_cadence, avg_speed_m_s, max_speed_m_s, suffer_score, avg_temp_c, elevation_gain_m, elev_high_m, elev_low_m, is_manual, is_trainer, is_commute, laps, splits_metric, splits_standard, best_efforts, segment_efforts";

/**
 * Read every interesting field on one activity from the DB, render as a
 * compact text block for tool_result. No Strava call. Covers any activity
 * type, including rides and cross-training. This is the default tool when
 * the athlete asks "what about that run / that ride / that activity".
 *
 * Output is curated, not the raw blob: a fixed shape with sections that
 * appear only when the underlying data is present. Token cost stays bounded
 * for long activities (rides with 200 segment efforts get truncated rather
 * than dropped).
 */
export async function executeLookupActivity(
  athleteId: string,
  args: LookupActivityArgs,
): Promise<string> {
  if (!args.activity_id || typeof args.activity_id !== "string") {
    return "lookup_activity requires activity_id (the UUID for the activity).";
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activities")
    .select(ACTIVITY_LOOKUP_COLUMNS)
    .eq("id", args.activity_id)
    .maybeSingle();

  if (error) return `Lookup failed: ${error.message}`;
  if (!data) return "Activity not found.";
  const row = data as ActivityRow;
  if (row.athlete_id !== athleteId) return "Activity not found.";

  return renderActivityLookup(row);
}

function renderActivityLookup(r: ActivityRow): string {
  const lines: string[] = [];
  const date = r.start_date_local.slice(0, 10);
  const time = r.start_date_local.slice(11, 16);
  const dow = new Date(r.start_date_local).toLocaleString("en-US", {
    weekday: "short",
  });
  const km = r.distance_m != null ? (r.distance_m / 1000).toFixed(2) : "n/a";
  const type = r.activity_type ?? "Activity";
  const name = r.name ? ` "${r.name.trim()}"` : "";
  lines.push(`${type} on ${date} (${dow}, ${time} local)${name}`);

  // Core metrics
  const core: string[] = [];
  core.push(`distance ${km} km`);
  if (r.moving_time_s != null) core.push(`moving ${formatDuration(r.moving_time_s)}`);
  if (r.elapsed_time_s != null && r.elapsed_time_s !== r.moving_time_s) {
    core.push(`elapsed ${formatDuration(r.elapsed_time_s)}`);
  }
  if (r.avg_pace_s_per_km) core.push(`pace ${formatPace(r.avg_pace_s_per_km)}`);
  if (r.avg_speed_m_s) core.push(`avg speed ${formatSpeedKmh(r.avg_speed_m_s)}`);
  if (r.max_speed_m_s) core.push(`max speed ${formatSpeedKmh(r.max_speed_m_s)}`);
  lines.push(core.join(", "));

  // Heart rate
  if (r.avg_hr != null || r.max_hr != null) {
    const hr: string[] = [];
    if (r.avg_hr != null) hr.push(`avg ${r.avg_hr}`);
    if (r.max_hr != null) hr.push(`max ${r.max_hr}`);
    lines.push(`HR: ${hr.join(", ")}`);
  }

  // Power (rides, occasionally runs)
  if (r.avg_watts != null || r.max_watts != null || r.kilojoules != null) {
    const pw: string[] = [];
    if (r.avg_watts != null) pw.push(`avg ${Math.round(r.avg_watts)} W`);
    if (r.weighted_avg_watts != null)
      pw.push(`weighted ${Math.round(r.weighted_avg_watts)} W`);
    if (r.max_watts != null) pw.push(`max ${r.max_watts} W`);
    if (r.kilojoules != null) pw.push(`${Math.round(r.kilojoules)} kJ`);
    if (r.device_watts === false) pw.push("(estimated)");
    lines.push(`Power: ${pw.join(", ")}`);
  }

  // Cadence
  if (r.avg_cadence != null) {
    lines.push(`Cadence: avg ${Math.round(r.avg_cadence)}`);
  }

  // Effort / suffer / temp
  const effort: string[] = [];
  if (r.suffer_score != null) effort.push(`suffer score ${Math.round(r.suffer_score)}`);
  if (r.avg_temp_c != null) effort.push(`avg temp ${Math.round(r.avg_temp_c)}°C`);
  if (effort.length) lines.push(effort.join(", "));

  // Elevation
  if (
    r.elevation_gain_m != null ||
    r.elev_high_m != null ||
    r.elev_low_m != null
  ) {
    const e: string[] = [];
    if (r.elevation_gain_m != null) e.push(`gain ${Math.round(r.elevation_gain_m)} m`);
    if (r.elev_high_m != null) e.push(`high ${Math.round(r.elev_high_m)} m`);
    if (r.elev_low_m != null) e.push(`low ${Math.round(r.elev_low_m)} m`);
    lines.push(`Elevation: ${e.join(", ")}`);
  }

  // Location & flags
  if (r.location_city) lines.push(`Location: ${r.location_city}`);
  const flags: string[] = [];
  if (r.is_manual) flags.push("manually entered (no device)");
  if (r.is_trainer) flags.push("indoor / trainer");
  if (r.is_commute) flags.push("commute");
  if (flags.length) lines.push(`Flags: ${flags.join(", ")}`);

  if (r.description && r.description.trim().length > 0) {
    lines.push(`Description: ${r.description.trim()}`);
  }

  // Laps
  const laps = Array.isArray(r.laps) ? (r.laps as StravaLap[]) : [];
  if (laps.length > 0) {
    lines.push(`\nLaps (${laps.length}):`);
    for (const l of laps.slice(0, 30)) {
      const lkm = (l.distance ?? 0) / 1000;
      const lpace =
        l.distance && l.moving_time
          ? Math.round(l.moving_time / (l.distance / 1000))
          : null;
      const lhr = l.average_heartrate ? `, HR ${Math.round(l.average_heartrate)}` : "";
      const lpw = l.average_speed ? `, ${formatSpeedKmh(l.average_speed)}` : "";
      lines.push(
        `  L${l.lap_index ?? "?"}: ${lkm.toFixed(2)} km, ${formatPace(lpace)} (${formatDuration(l.moving_time)})${lhr}${lpw}`,
      );
    }
    if (laps.length > 30) lines.push(`  ... ${laps.length - 30} more laps`);
  }

  // Splits (per km)
  const splits = Array.isArray(r.splits_metric) ? (r.splits_metric as StravaSplit[]) : [];
  if (splits.length > 0) {
    lines.push(`\nPer-km splits (${splits.length}):`);
    for (const s of splits.slice(0, 30)) {
      const space =
        s.distance && s.moving_time
          ? Math.round(s.moving_time / (s.distance / 1000))
          : null;
      const shr = s.average_heartrate ? `, HR ${Math.round(s.average_heartrate)}` : "";
      lines.push(`  K${s.split}: ${formatPace(space)}${shr}`);
    }
    if (splits.length > 30) lines.push(`  ... ${splits.length - 30} more splits`);
  }

  // Best efforts (running only)
  const efforts = Array.isArray(r.best_efforts) ? (r.best_efforts as StravaBestEffort[]) : [];
  if (efforts.length > 0) {
    lines.push(`\nAuto-detected best efforts:`);
    for (const e of efforts) {
      const pr = e.pr_rank != null ? ` (PR rank ${e.pr_rank})` : "";
      lines.push(`  ${e.name}: ${formatDuration(e.elapsed_time)}${pr}`);
    }
  }

  // Segment efforts
  const segs = Array.isArray(r.segment_efforts)
    ? (r.segment_efforts as StravaSegmentEffort[])
    : [];
  if (segs.length > 0) {
    lines.push(`\nSegment efforts (${segs.length}):`);
    for (const s of segs.slice(0, 10)) {
      const sname = s.segment?.name ?? s.name;
      const sdist = s.distance ? `${(s.distance / 1000).toFixed(2)} km` : "";
      const grade =
        s.segment?.average_grade != null
          ? `, ${s.segment.average_grade.toFixed(1)}% avg`
          : "";
      const pr = s.pr_rank != null ? `, PR rank ${s.pr_rank}` : "";
      const kom = s.kom_rank != null ? `, KOM rank ${s.kom_rank}` : "";
      lines.push(
        `  "${sname}" ${sdist}${grade}: ${formatDuration(s.elapsed_time)}${pr}${kom}`,
      );
    }
    if (segs.length > 10) lines.push(`  ... ${segs.length - 10} more segment efforts`);
  }

  return lines.join("\n");
}

// =============================================================================
// query_activities — DB range/aggregate read across types
// =============================================================================

export type QueryActivitiesArgs = {
  from?: string; // YYYY-MM-DD
  to?: string;
  types?: Array<"run" | "ride" | "cross_training" | "all">;
  granularity?: "run" | "week" | "month";
};

/**
 * Read activities from the DB (no Strava call) for a date range, optionally
 * filtered by activity class. This replaces the runs-only
 * query_training_history. Default types is ['run'] for back-compat with the
 * common case ("what was my running volume in August"), but the model can
 * pass ['ride'] or ['all'] to read across cross-training too.
 */
export async function executeQueryActivities(
  athleteId: string,
  args: QueryActivitiesArgs,
): Promise<string> {
  const admin = createAdminClient();
  const from = args.from ?? defaultFromIso();
  const to = args.to ?? new Date().toISOString().slice(0, 10);
  const granularity = args.granularity ?? "week";
  const requestedTypes = (args.types && args.types.length > 0
    ? args.types
    : ["run"]) as Array<"run" | "ride" | "cross_training" | "all">;
  const includeAll = requestedTypes.includes("all");
  const wantRun = includeAll || requestedTypes.includes("run");
  const wantRide = includeAll || requestedTypes.includes("ride");
  const wantCross = includeAll || requestedTypes.includes("cross_training");

  const { data, error } = await admin
    .from("activities")
    .select(
      "id, start_date_local, name, activity_type, distance_m, moving_time_s, avg_pace_s_per_km, avg_hr, max_hr, avg_watts, suffer_score",
    )
    .eq("athlete_id", athleteId)
    .gte("start_date_local", `${from}T00:00:00`)
    .lt("start_date_local", `${to}T23:59:59.999`)
    .order("start_date_local", { ascending: true });
  if (error) return `Query failed: ${error.message}`;

  const rows = (data ?? []).filter((r) => {
    const cls = classifyActivityType(
      (r as { activity_type: string | null }).activity_type,
    );
    if (cls === "ambient") return false;
    if (cls === "run") return wantRun;
    // Treat Ride explicitly when types includes 'ride' even if it would
    // otherwise be classified cross_training; Strava's sport_type is the
    // truth source.
    const isRide =
      (r as { activity_type: string | null }).activity_type === "Ride" ||
      (r as { activity_type: string | null }).activity_type === "VirtualRide";
    if (isRide) return wantRide;
    return wantCross;
  }) as Array<{
    id: string;
    start_date_local: string;
    name: string | null;
    activity_type: string | null;
    distance_m: number | null;
    moving_time_s: number | null;
    avg_pace_s_per_km: number | null;
    avg_hr: number | null;
    max_hr: number | null;
    avg_watts: number | null;
    suffer_score: number | null;
  }>;

  if (rows.length === 0) {
    return `No activities matching types=${requestedTypes.join(",")} between ${from} and ${to}.`;
  }

  if (granularity === "run") {
    const lines = rows.slice(0, 50).map((r) => {
      const km = (r.distance_m ?? 0) / 1000;
      const pace = formatPace(r.avg_pace_s_per_km);
      const dur =
        r.moving_time_s != null ? `, ${formatDuration(r.moving_time_s)}` : "";
      const hr = r.avg_hr ? `, HR ${r.avg_hr}` : "";
      const watts = r.avg_watts ? `, ${Math.round(r.avg_watts)} W` : "";
      const name = r.name ? ` "${r.name.trim()}"` : "";
      return `- ${r.start_date_local.slice(0, 10)} [${r.activity_type ?? "?"}]${name}, ${km.toFixed(1)} km${dur}, ${pace}${hr}${watts} (id=${r.id})`;
    });
    const truncated =
      rows.length > 50 ? `\n(+${rows.length - 50} more, narrow the range to see them)` : "";
    return `Activities ${from} to ${to} (${rows.length} matched):\n${lines.join("\n")}${truncated}`;
  }

  if (granularity === "month") {
    const buckets = new Map<
      string,
      { km: number; n: number; longest: number; minutes: number }
    >();
    for (const r of rows) {
      const key = r.start_date_local.slice(0, 7);
      const km = (r.distance_m ?? 0) / 1000;
      const minutes = r.moving_time_s != null ? Math.round(r.moving_time_s / 60) : 0;
      const e = buckets.get(key) ?? { km: 0, n: 0, longest: 0, minutes: 0 };
      e.km += km;
      e.n += 1;
      e.minutes += minutes;
      if (km > e.longest) e.longest = km;
      buckets.set(key, e);
    }
    const lines = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([m, e]) =>
          `- ${m}: ${Math.round(e.km)} km across ${e.n} sessions, ${e.minutes} min, longest ${e.longest.toFixed(1)} km`,
      );
    return `Monthly summary ${from} to ${to} (types=${requestedTypes.join(",")}):\n${lines.join("\n")}`;
  }

  // week
  const weekBuckets = new Map<
    string,
    { km: number; n: number; longest: number; minutes: number }
  >();
  for (const r of rows) {
    const d = new Date(r.start_date_local);
    const day = d.getDay();
    const diffToMonday = (day + 6) % 7;
    d.setDate(d.getDate() - diffToMonday);
    const key = d.toISOString().slice(0, 10);
    const km = (r.distance_m ?? 0) / 1000;
    const minutes = r.moving_time_s != null ? Math.round(r.moving_time_s / 60) : 0;
    const e = weekBuckets.get(key) ?? { km: 0, n: 0, longest: 0, minutes: 0 };
    e.km += km;
    e.n += 1;
    e.minutes += minutes;
    if (km > e.longest) e.longest = km;
    weekBuckets.set(key, e);
  }
  const lines = Array.from(weekBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([w, e]) =>
        `- week of ${w}: ${Math.round(e.km)} km across ${e.n} sessions, ${e.minutes} min, longest ${e.longest.toFixed(1)} km`,
    );
  return `Weekly summary ${from} to ${to} (types=${requestedTypes.join(",")}):\n${lines.join("\n")}`;
}

function defaultFromIso(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

// =============================================================================
// read_rpe_history — DB read of trailing RPE answers joined to activity
// =============================================================================

export type ReadRpeHistoryArgs = {
  from?: string; // YYYY-MM-DD
  to?: string;
};

/**
 * Read the athlete's RPE answers (in-app) for a date range, joined with the
 * activity that was rated. Used when chat asks for RPE patterns. Cheap, no
 * Strava call.
 */
export async function executeReadRpeHistory(
  athleteId: string,
  args: ReadRpeHistoryArgs,
): Promise<string> {
  const admin = createAdminClient();
  const from = args.from ?? defaultFromIsoMonths(1);
  const to = args.to ?? new Date().toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("activity_notes")
    .select(
      "rpe_value, rpe_answered_at, activities!inner(start_date_local, name, activity_type, distance_m, moving_time_s, avg_pace_s_per_km, avg_hr)",
    )
    .eq("athlete_id", athleteId)
    .not("rpe_value", "is", null)
    .gte("activities.start_date_local", `${from}T00:00:00`)
    .lte("activities.start_date_local", `${to}T23:59:59.999`);
  if (error) return `RPE query failed: ${error.message}`;

  type RpeRow = {
    rpe_value: number;
    rpe_answered_at: string | null;
    activities: {
      start_date_local: string;
      name: string | null;
      activity_type: string | null;
      distance_m: number | null;
      moving_time_s: number | null;
      avg_pace_s_per_km: number | null;
      avg_hr: number | null;
    };
  };
  const rows = ((data ?? []) as unknown as RpeRow[])
    .filter((r) => r.activities)
    .sort((a, b) =>
      a.activities.start_date_local.localeCompare(b.activities.start_date_local),
    );

  if (rows.length === 0) {
    return `No RPE answers between ${from} and ${to}.`;
  }

  const lines = rows.map((r) => {
    const a = r.activities;
    const date = a.start_date_local.slice(0, 10);
    const km = (a.distance_m ?? 0) / 1000;
    const pace = formatPace(a.avg_pace_s_per_km);
    const hr = a.avg_hr ? `, HR ${a.avg_hr}` : "";
    const type = a.activity_type ?? "?";
    return `- ${date} [${type}] ${km.toFixed(1)} km, ${pace}${hr}, RPE ${r.rpe_value}`;
  });

  // Light aggregate: distribution of RPE values and a simple mean.
  const values = rows.map((r) => r.rpe_value);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const dist = Array.from(counts.entries())
    .sort(([a], [b]) => a - b)
    .map(([rpe, n]) => `${rpe}:${n}`)
    .join(" ");

  return [
    `RPE answers ${from} to ${to} (${rows.length} total, mean ${mean.toFixed(1)}, distribution ${dist}):`,
    ...lines,
  ].join("\n");
}

function defaultFromIsoMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

// =============================================================================
// refresh_activity_from_strava — live Strava call to top up missing detail
// =============================================================================

export type RefreshActivityArgs = { activity_id: string };

/**
 * Force-refresh a single activity from Strava. Used only when lookup_activity
 * shows the row is missing detail that should normally be there (laps,
 * splits, segment efforts) for an activity we expect to have ingested with
 * detail. Counts against the daily detail-fetch cap.
 *
 * For day-to-day "what about that ride" questions, lookup_activity is the
 * right tool, this one is the escape hatch when the DB row is incomplete.
 */
export async function executeRefreshActivityFromStrava(
  athleteId: string,
  args: RefreshActivityArgs,
): Promise<string> {
  if (!args.activity_id || typeof args.activity_id !== "string") {
    return "refresh_activity_from_strava requires activity_id (UUID).";
  }

  const admin = createAdminClient();
  const { data: ownerRow } = await admin
    .from("activities")
    .select("athlete_id")
    .eq("id", args.activity_id)
    .maybeSingle();
  if (!ownerRow) return "Activity not found.";
  if ((ownerRow as { athlete_id: string }).athlete_id !== athleteId) {
    return "Activity not found.";
  }

  const reserved = await reserveDetailFetchSlot(athleteId);
  if (reserved === null) {
    return `Daily Strava-refresh limit reached (${DAILY_DETAIL_FETCH_CAP}). Tell the athlete you can't pull fresh detail today and offer to revisit tomorrow.`;
  }

  const result = await ensureActivityLapDetail(args.activity_id);
  if (!result.ok) {
    return `Could not refresh that activity: ${result.reason}.`;
  }

  // Re-render via lookup so the model sees the post-refresh shape with all
  // fields the new ingest pulls in.
  return executeLookupActivity(athleteId, { activity_id: args.activity_id });
}
