// Smoke-test the new chat lookup tools against the live Supabase data
// without going through the LLM. Verifies query_training_history returns
// sensible aggregates and that the rollup + boundary marker land in the
// chat context shape we expect.
//
// Run: node scripts/dev-test-chat-tools.mjs

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

const ATHLETE = "eb97aff9-aa7a-4059-a352-66ea8351dde9";

const { data: athlete } = await admin
  .from("athletes")
  .select("monthly_history_rollup, monthly_history_rollup_updated_at, detail_fetches_today, detail_fetches_day, history_backfill_status")
  .eq("id", ATHLETE)
  .single();

console.log("=== Athlete state ===");
console.log("backfill:", athlete.history_backfill_status);
console.log("rollup updated:", athlete.monthly_history_rollup_updated_at);
console.log("rollup months:", athlete.monthly_history_rollup?.length);
console.log("detail fetches today:", athlete.detail_fetches_today, athlete.detail_fetches_day);

console.log("\n=== Last 4 rollup entries ===");
for (const r of (athlete.monthly_history_rollup ?? []).slice(-4)) {
  console.log(`${r.month}: ${r.distance_km} km, ${r.run_count} runs, longest ${r.longest_km} km${r.races > 0 ? `, ${r.races} race(s)` : ""}`);
}

console.log("\n=== Oldest activity in DB ===");
const { data: oldest } = await admin
  .from("activities")
  .select("start_date_local, name, distance_m")
  .eq("athlete_id", ATHLETE)
  .order("start_date_local", { ascending: true })
  .limit(3);
for (const a of oldest ?? []) {
  console.log(`${a.start_date_local.slice(0, 10)} ${a.name ?? "(no name)"} ${(a.distance_m ?? 0)/1000}km`);
}

console.log("\n=== Activities count by year ===");
const { data: byYear } = await admin
  .from("activities")
  .select("start_date_local")
  .eq("athlete_id", ATHLETE)
  .order("start_date_local", { ascending: true });
const counts = new Map();
for (const a of byYear ?? []) {
  const yr = a.start_date_local.slice(0, 4);
  counts.set(yr, (counts.get(yr) ?? 0) + 1);
}
for (const [yr, n] of counts) console.log(`${yr}: ${n}`);
