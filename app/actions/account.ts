"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireAthlete } from "@/app/actions/onboarding";

const STRAVA_DEAUTHORIZE_URL = "https://www.strava.com/oauth/deauthorize";

/**
 * Soft-delete the athlete's account.
 *
 *  1. Disconnect Strava (calls Strava's deauthorize endpoint, removes the
 *     connection row) so the athlete-facing API revocation happens
 *     immediately, not in 30 days.
 *  2. Mark `athletes.deleted_at = now()`. Sign-in flow rejects sessions
 *     where this is set, so the athlete cannot sign back in.
 *  3. Sign the current session out.
 *  4. Redirect to the marketing home.
 *
 * The 30-day hard-delete (which calls auth.admin.deleteUser and lets the
 * cascade remove everything) is performed by the cron at
 * /api/cron/account-purge. The 30-day window is documented in the
 * Privacy Policy.
 */
export async function requestAccountDeletion() {
  const { athlete } = await requireAthlete();
  const admin = createAdminClient();

  // Step 1: best-effort Strava revocation.
  const { data: conn } = await admin
    .from("strava_connections")
    .select("access_token, is_mock")
    .eq("athlete_id", athlete.id)
    .maybeSingle();

  const token = (conn as { access_token?: string | null; is_mock?: boolean } | null)
    ?.access_token;
  const isMock = (conn as { is_mock?: boolean } | null)?.is_mock ?? false;

  if (token && !isMock) {
    try {
      await fetch(STRAVA_DEAUTHORIZE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch (err) {
      console.warn("strava deauthorize during account deletion failed", err);
    }
  }

  await admin.from("strava_connections").delete().eq("athlete_id", athlete.id);

  // Step 2: soft-delete marker.
  await admin
    .from("athletes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", athlete.id);

  // Step 3: end the session.
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/?deleted=1");
}
