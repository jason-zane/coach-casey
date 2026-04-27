/**
 * Reset an athlete to "just signed up" so they can run the full onboarding
 * again end-to-end. Clears:
 *
 *   - athletes: onboarding flags, profile fields populated by the new
 *     about-you step (date_of_birth, sex, weight_kg) and units
 *   - strava_connections: row deleted so the OAuth flow re-runs
 *   - preferences: plan_follower_status reset (drives the plan step)
 *   - goal_races: deactivated (won't be hit during onboarding but the
 *     post-onboarding goal-race step writes here, so a clean slate is
 *     friendlier)
 *
 * Does NOT delete: activities, memory_items, threads, messages,
 * push_subscriptions. Onboarding is about confirming what we know — not
 * wiping the athlete's history.
 *
 * Usage: node scripts/dev-reset-onboarding.mjs <email>
 */

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

const [, , email] = process.argv;
if (!email) {
  console.error("usage: node scripts/dev-reset-onboarding.mjs <email>");
  process.exit(1);
}

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: athlete, error: lookupErr } = await admin
  .from("athletes")
  .select("id, email")
  .eq("email", email)
  .maybeSingle();
if (lookupErr) {
  console.error(lookupErr);
  process.exit(1);
}
if (!athlete) {
  console.error(`No athlete found for ${email}`);
  process.exit(1);
}

const { error: athleteErr } = await admin
  .from("athletes")
  .update({
    onboarding_current_step: "strava",
    onboarding_completed_at: null,
    date_of_birth: null,
    sex: null,
    weight_kg: null,
    units: "metric",
  })
  .eq("id", athlete.id);
if (athleteErr) {
  console.error(athleteErr);
  process.exit(1);
}

const { error: stravaErr } = await admin
  .from("strava_connections")
  .delete()
  .eq("athlete_id", athlete.id);
if (stravaErr) {
  console.error(stravaErr);
  process.exit(1);
}

const { error: prefErr } = await admin
  .from("preferences")
  .update({ plan_follower_status: "unknown" })
  .eq("athlete_id", athlete.id);
if (prefErr) {
  console.error(prefErr);
  process.exit(1);
}

const { error: raceErr } = await admin
  .from("goal_races")
  .update({ is_active: false })
  .eq("athlete_id", athlete.id)
  .eq("is_active", true);
if (raceErr) {
  console.error(raceErr);
  process.exit(1);
}

console.log(`Reset ${email} (${athlete.id}) to a fresh onboarding state.`);
console.log("Next step: open /app, you'll be routed back through /onboarding/strava.");
