// Dev-only helper — flips the signed-in test user's onboarding state so the
// home surface can be exercised without clicking through onboarding.
// Usage: node scripts/dev-onboarding-toggle.mjs <email> complete|reset
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

const [, , email, mode] = process.argv;
if (!email || !["complete", "reset"].includes(mode)) {
  console.error("usage: node scripts/dev-onboarding-toggle.mjs <email> complete|reset");
  process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const update =
  mode === "complete"
    ? { onboarding_completed_at: new Date().toISOString(), onboarding_current_step: "welcome" }
    : { onboarding_completed_at: null, onboarding_current_step: "strava" };

const { data, error } = await admin
  .from("athletes")
  .update(update)
  .eq("email", email)
  .select("id, email, onboarding_completed_at, onboarding_current_step");

if (error) {
  console.error(error);
  process.exit(1);
}
console.log(data);
