// One-off: compute monthly_history_rollup for athletes whose backfill has
// already completed (the rollup compute lands inside the cron path going
// forward; this script just catches up athletes whose backfill finished
// before that wiring existed).
//
// Run: node scripts/dev-compute-history-rollup.mjs

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
  .select("id, history_backfill_status")
  .eq("history_backfill_status", "done");

console.log(`Found ${athletes.length} athletes with backfill done.`);

for (const a of athletes) {
  const { data: rows } = await admin
    .from("activities")
    .select("start_date_local, activity_type, distance_m, name, raw")
    .eq("athlete_id", a.id)
    .lt("start_date_local", recentBoundary.toISOString())
    .order("start_date_local", { ascending: true });

  const buckets = new Map();
  for (const r of rows ?? []) {
    const cls = classifyType(r.activity_type);
    if (cls !== "run" && cls !== "catch_all") continue;
    const km = (r.distance_m ?? 0) / 1000;
    if (km <= 0) continue;
    const key = r.start_date_local.slice(0, 7);
    const e = buckets.get(key) ?? { month: key, distance_km: 0, run_count: 0, longest_km: 0, races: 0 };
    e.distance_km += km;
    e.run_count += 1;
    if (km > e.longest_km) e.longest_km = km;
    if (isLikelyRace(r.name, r.raw)) e.races += 1;
    buckets.set(key, e);
  }
  const rollup = Array.from(buckets.values())
    .map((e) => ({
      ...e,
      distance_km: Math.round(e.distance_km),
      longest_km: Math.round(e.longest_km * 10) / 10,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  await admin
    .from("athletes")
    .update({
      monthly_history_rollup: rollup,
      monthly_history_rollup_updated_at: new Date().toISOString(),
    })
    .eq("id", a.id);

  console.log(`Athlete ${a.id}: ${rollup.length} months, oldest=${rollup[0]?.month ?? "n/a"}`);
}

console.log("Done.");
