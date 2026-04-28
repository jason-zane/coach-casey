"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Sync the athlete's timezone from the browser-detected IANA name.
 *
 * Called once per session from the (app) layout. The browser passes
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` and we trust the
 * value to be a valid IANA name (browsers normalise these).
 *
 * Always trusts the most recent browser detection. The earlier "set once"
 * behaviour left athletes pinned to whatever the first session reported
 *, which was wrong for anyone who signed up via a misconfigured device,
 * a VPN, or a locale that happened to differ from where they actually
 * train. Travelers see local time for the trip and snap back on return,
 * which is what most people expect from a phone-class app.
 *
 * Skips the write when the value is unchanged so we don't churn
 * `updated_at` on every navigation.
 *
 * Returns the timezone now stored, or null if the user isn't signed in
 * or the input was empty.
 */
export async function setAthleteTimezone(
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

  const { data: athlete } = await admin
    .from("athletes")
    .select("id, timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!athlete) return { ok: false, timezone: null };

  const current = (athlete as { timezone: string | null }).timezone;
  if (current === tz) {
    return { ok: true, timezone: current };
  }

  await admin
    .from("athletes")
    .update({ timezone: tz })
    .eq("id", (athlete as { id: string }).id);

  return { ok: true, timezone: tz };
}
