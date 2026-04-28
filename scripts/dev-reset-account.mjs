// Dev-only: full data wipe for the named athlete so onboarding can be
// re-walked from scratch. Keeps `auth.users` and the `athletes` row itself
// (so the existing sign-in still works), but resets every onboarding /
// profile / activity / message / memory / preference field on or scoped
// to that athlete.
//
// Usage: node scripts/dev-reset-account.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const ATHLETE_EMAIL = "jasonzanehunt@gmail.com";

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
);

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Tables wiped via athlete_id. Order doesn't matter functionally because
// every FK uses ON DELETE CASCADE, but keeping leaf tables before parent
// tables makes the log readable when something errors.
const ATHLETE_SCOPED_TABLES = [
  "activity_notes",
  "activities",
  "messages",
  "threads",
  "memory_items",
  "goal_races",
  "training_plans",
  "preferences",
  "strava_connections",
  "validation_observations",
  "push_subscriptions",
];

const { data: athletes, error: aErr } = await admin
  .from("athletes")
  .select("id, email")
  .eq("email", ATHLETE_EMAIL)
  .limit(1);
if (aErr) throw aErr;
if (!athletes?.length) {
  throw new Error(`No athlete found for ${ATHLETE_EMAIL}`);
}
const athlete = athletes[0];
console.log(`→ Athlete ${athlete.id} (${athlete.email})`);

for (const table of ATHLETE_SCOPED_TABLES) {
  const { error } = await admin.from(table).delete().eq("athlete_id", athlete.id);
  if (error) {
    // PGRST116 (no rows) is fine; anything else is real.
    if (error.code === "PGRST116") continue;
    console.warn(`! ${table} delete error: ${error.code} ${error.message}`);
    continue;
  }
  console.log(`  ✓ wiped ${table}`);
}

// Reset every onboarding / profile / RPE / history-backfill column on the
// athletes row to its post-signup default. `email`, `id`, `user_id`,
// `created_at`, and `updated_at` stay; everything else goes back to the
// shape `handle_new_auth_user` would have produced.
const { error: resetErr } = await admin
  .from("athletes")
  .update({
    display_name: null,
    onboarding_current_step: "strava",
    onboarding_completed_at: null,
    weight_kg: null,
    sex: null,
    date_of_birth: null,
    units: "metric",
    timezone: null,
    rpe_prompts_paused_until_run: null,
    rpe_skip_count_anchor_at_run: null,
    rpe_prompts_paused_until_xtrain: null,
    rpe_skip_count_anchor_at_xtrain: null,
    history_backfill_status: "idle",
    history_backfill_floor_iso: null,
    history_backfill_started_at: null,
    history_backfill_completed_at: null,
    history_backfill_last_error: null,
    deleted_at: null,
  })
  .eq("id", athlete.id);
if (resetErr) throw resetErr;
console.log("  ✓ reset athlete profile + onboarding fields");

console.log("✓ Done. Sign in and onboarding will start from /onboarding/strava.");
