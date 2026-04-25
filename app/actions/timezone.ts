"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Self-heal the athlete's timezone from a browser-detected IANA name.
 *
 * Called once per session from the (app) layout when the row is missing a
 * timezone. The browser passes
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` and we trust the
 * value to be a valid IANA name (browsers normalise these). The action
 * deliberately *only* sets when the column is null — once captured, we
 * don't keep overwriting on every page load (which would break athletes
 * who travel and want their home timezone respected).
 *
 * Returns the timezone now stored, or null if the user isn't signed in
 * or the input was empty.
 */
export async function setAthleteTimezoneIfMissing(
  tz: string,
): Promise<{ ok: boolean; timezone: string | null }> {
  if (!tz || typeof tz !== "string" || tz.length > 64) {
    return { ok: false, timezone: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, timezone: null };

  const admin = createAdminClient();

  // Fetch current value first so we only write when missing. Avoids
  // unnecessary updates and the trigger-driven `updated_at` churn.
  const { data: athlete } = await admin
    .from("athletes")
    .select("id, timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete) return { ok: false, timezone: null };

  const current = (athlete as { timezone: string | null }).timezone;
  if (current) {
    return { ok: true, timezone: current };
  }

  await admin
    .from("athletes")
    .update({ timezone: tz })
    .eq("id", (athlete as { id: string }).id);

  return { ok: true, timezone: tz };
}
