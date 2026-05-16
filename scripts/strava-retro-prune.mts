/**
 * One-shot retro-prune of existing `activities` rows.
 *
 * Applies the same trim rules as the new `mapStravaActivity` to every row in
 * the activities table:
 *
 *   - Whitelist the `raw` JSONB blob (drops polylines, social counts, photos,
 *     sharing preferences, plumbing).
 *   - Trim per-lap sub-fields, with run-vs-ride gating on speed/watts.
 *   - Trim per-split sub-fields.
 *   - Trim per-best-effort sub-fields.
 *   - NULL `segment_efforts` (no longer persisted).
 *   - NULL run-row power / speed columns and the matching keys inside `raw`.
 *
 * Idempotent: re-running over already-pruned rows is a no-op (the trim
 * functions return the same shape they were given).
 *
 * Usage:
 *   node --experimental-strip-types scripts/strava-retro-prune.mts [--dry-run]
 *
 * Reads SUPABASE_URL + service role from .env.local. Streams in pages of
 * 200 rows so memory stays bounded even on large activity tables.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const DRY_RUN = process.argv.includes("--dry-run");
const PAGE_SIZE = 200;

const envText = readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [
        l.slice(0, idx).trim(),
        l.slice(idx + 1).trim().replace(/^"|"$/g, ""),
      ];
    }),
) as Record<string, string>;

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Mirrors the constants in lib/strava/ingest.ts. Keep in sync.
const RAW_WHITELIST = new Set([
  "id", "name", "description", "start_date_local", "timezone", "utc_offset",
  "location_city", "type", "sport_type", "workout_type", "distance",
  "moving_time", "elapsed_time", "average_heartrate", "max_heartrate",
  "average_cadence", "average_temp", "total_elevation_gain", "elev_high",
  "elev_low", "manual", "trainer", "commute", "suffer_score", "gear_id",
  "device_name", "average_speed", "max_speed", "average_watts", "max_watts",
  "weighted_average_watts", "kilojoules", "device_watts",
]);
const RUN_RAW_DROP = new Set([
  "average_speed", "max_speed", "average_watts", "max_watts",
  "weighted_average_watts", "kilojoules", "device_watts",
]);

const LAP_RUN = ["lap_index", "name", "distance", "moving_time", "elapsed_time", "total_elevation_gain", "average_cadence", "average_heartrate", "max_heartrate"];
const LAP_RIDE = [...LAP_RUN, "average_speed", "max_speed", "average_watts", "max_watts"];
const SPLIT_KEEP = ["split", "distance", "elapsed_time", "moving_time", "average_speed", "elevation_difference", "average_heartrate", "average_grade_adjusted_speed"];
const BEST_EFFORT_KEEP = ["name", "distance", "elapsed_time", "moving_time", "pr_rank"];

function isRun(type: string | null | undefined): boolean {
  return typeof type === "string" && /run/i.test(type);
}

function pick(obj: Record<string, unknown> | null | undefined, keys: readonly string[]): Record<string, unknown> {
  if (!obj) return {};
  const out: Record<string, unknown> = {};
  for (const k of keys) if (obj[k] != null) out[k] = obj[k];
  return out;
}

function trimRaw(d: Record<string, unknown> | null, run: boolean): Record<string, unknown> | null {
  if (!d) return null;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(d)) {
    if (!RAW_WHITELIST.has(k)) continue;
    if (run && RUN_RAW_DROP.has(k)) continue;
    out[k] = d[k];
  }
  const gear = d.gear as { name?: string } | null | undefined;
  if (gear?.name) out.gear = { name: gear.name };
  return out;
}

type ActivityRow = {
  id: string;
  activity_type: string | null;
  raw: Record<string, unknown> | null;
  laps: unknown;
  splits_metric: unknown;
  splits_standard: unknown;
  best_efforts: unknown;
  segment_efforts: unknown;
  avg_watts: number | null;
  max_watts: number | null;
  weighted_avg_watts: number | null;
  kilojoules: number | null;
  device_watts: boolean | null;
  avg_speed_m_s: number | null;
  max_speed_m_s: number | null;
};

async function processPage(offset: number): Promise<number> {
  const { data, error } = await admin
    .from("activities")
    .select(
      "id, activity_type, raw, laps, splits_metric, splits_standard, best_efforts, segment_efforts, avg_watts, max_watts, weighted_avg_watts, kilojoules, device_watts, avg_speed_m_s, max_speed_m_s",
    )
    .order("id", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);
  if (error) throw error;
  const rows = (data ?? []) as ActivityRow[];

  for (const r of rows) {
    const run = isRun(r.activity_type);

    const trimmedLaps = Array.isArray(r.laps)
      ? r.laps.map((l) => pick(l as Record<string, unknown>, run ? LAP_RUN : LAP_RIDE))
      : null;
    const trimmedSplitsMetric = Array.isArray(r.splits_metric)
      ? r.splits_metric.map((s) => pick(s as Record<string, unknown>, SPLIT_KEEP))
      : null;
    const trimmedSplitsStandard = Array.isArray(r.splits_standard)
      ? r.splits_standard.map((s) => pick(s as Record<string, unknown>, SPLIT_KEEP))
      : null;
    const trimmedBestEfforts = Array.isArray(r.best_efforts)
      ? r.best_efforts.map((e) => pick(e as Record<string, unknown>, BEST_EFFORT_KEEP))
      : null;

    const update: Record<string, unknown> = {
      raw: trimRaw(r.raw, run),
      laps: trimmedLaps,
      splits_metric: trimmedSplitsMetric,
      splits_standard: trimmedSplitsStandard,
      best_efforts: trimmedBestEfforts,
      segment_efforts: null,
    };
    if (run) {
      update.avg_watts = null;
      update.max_watts = null;
      update.weighted_avg_watts = null;
      update.kilojoules = null;
      update.device_watts = null;
      update.avg_speed_m_s = null;
      update.max_speed_m_s = null;
    }

    if (DRY_RUN) continue;
    const { error: upErr } = await admin
      .from("activities")
      .update(update)
      .eq("id", r.id);
    if (upErr) {
      console.warn(`row ${r.id}: ${upErr.message}`);
    }
  }

  return rows.length;
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN - no writes" : "live run");
  let offset = 0;
  let total = 0;
  while (true) {
    const n = await processPage(offset);
    if (n === 0) break;
    total += n;
    offset += n;
    process.stdout.write(`  processed ${total} rows\r`);
    if (n < PAGE_SIZE) break;
  }
  console.log(`\ndone. ${total} rows processed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
