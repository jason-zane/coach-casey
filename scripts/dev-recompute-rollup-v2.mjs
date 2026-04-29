// One-off: recompute monthly_history_rollup with the new shape that includes
// cross-training (rides, swims, gym, yoga) alongside running. Mirrors the
// aggregation in lib/strava/history-rollup.ts — stays a node script so we
// don't have to wait for the cron-driven backfill cycle to refresh it.
//
// Run: node scripts/dev-recompute-rollup-v2.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const envText = readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RECENT_WINDOW_WEEKS = 12;

function isLikelyRace(name, raw) {
  if (raw && typeof raw === "object" && raw.workout_type === 1) return true;
  if (!name) return false;
  return /\b(race|marathon|half|10k|5k|parkrun)\b/i.test(name);
}

function classifyType(t) {
  if (!t) return "catch_all";
  const lc = t.toLowerCase();
  if (lc.includes("run") || lc === "trailrun" || lc === "virtualrun") return "run";
  if (lc === "walk" || lc === "hike") return "ambient";
  return "cross_training";
}

const recentBoundary = new Date();
recentBoundary.setDate(recentBoundary.getDate() - RECENT_WINDOW_WEEKS * 7);
recentBoundary.setHours(0, 0, 0, 0);

const { data: athletes } = await admin
  .from("athletes")
  .select("id, display_name, history_backfill_status");

for (const a of athletes ?? []) {
  if (a.history_backfill_status !== "done") continue;

  const { data: rows } = await admin
    .from("activities")
    .select("start_date_local, activity_type, distance_m, moving_time_s, name, raw")
    .eq("athlete_id", a.id)
    .lt("start_date_local", recentBoundary.toISOString())
    .order("start_date_local", { ascending: true });

  const buckets = new Map();
  for (const r of rows ?? []) {
    const cls = classifyType(r.activity_type);
    const isRun = cls === "run";
    const isCross = cls === "cross_training" || cls === "catch_all";
    if (!isRun && !isCross) continue;

    const km = (r.distance_m ?? 0) / 1000;
    const minutes = r.moving_time_s != null ? Math.round(r.moving_time_s / 60) : 0;
    const key = r.start_date_local.slice(0, 7);
    const e =
      buckets.get(key) ?? {
        month: key,
        run_distance_km: 0,
        run_count: 0,
        longest_run_km: 0,
        races: 0,
        cross_distance_km: 0,
        cross_count: 0,
        cross_total_minutes: 0,
      };

    if (isRun) {
      if (km <= 0) continue;
      e.run_distance_km += km;
      e.run_count += 1;
      if (km > e.longest_run_km) e.longest_run_km = km;
      if (isLikelyRace(r.name, r.raw)) e.races += 1;
    } else {
      e.cross_count += 1;
      e.cross_total_minutes += minutes;
      if (km > 0) e.cross_distance_km += km;
    }
    buckets.set(key, e);
  }

  const rollup = Array.from(buckets.values())
    .map((e) => ({
      ...e,
      run_distance_km: Math.round(e.run_distance_km),
      longest_run_km: Math.round(e.longest_run_km * 10) / 10,
      cross_distance_km: Math.round(e.cross_distance_km),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  await admin
    .from("athletes")
    .update({
      monthly_history_rollup: rollup,
      monthly_history_rollup_updated_at: new Date().toISOString(),
    })
    .eq("id", a.id);

  console.log(
    `Athlete ${a.display_name ?? a.id}: rolled up ${rollup.length} months, last 3:`,
    rollup.slice(-3),
  );
}
