"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/auth";
import { generateWeeklyReviewForAthlete } from "@/app/actions/weekly-review";

/**
 * Toggle the is_test_user flag on an athlete. Used to mark friends /
 * internal cohort members so they can be excluded from any future
 * production-cohort metrics, gating, or analytics. Safe to flip in
 * either direction; nothing destructive.
 */
export async function toggleTestUser(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate.ok) redirect(gate.redirect);

  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const targetRaw = String(formData.get("target") ?? "");
  const target = targetRaw === "true" || targetRaw === "false" ? targetRaw === "true" : null;
  if (!athleteId || target == null) {
    throw new Error("toggleTestUser: athlete_id and target=true|false required");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("athletes")
    .update({ is_test_user: target })
    .eq("id", athleteId);
  if (error) throw error;

  revalidatePath("/app/admin");
}

/**
 * Manually trigger a weekly review for an athlete, bypassing the
 * cron's local-Monday gate. Used to seed friends who joined mid-week
 * with a first review immediately, or to re-fire when the cron missed
 * an athlete due to outage.
 *
 * Idempotent unless ?force=1, in which case the existing review for
 * the same week is deleted and replaced.
 */
export async function adminGenerateWeeklyReview(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate.ok) redirect(gate.redirect);

  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  const force = formData.get("force") === "1";
  const weekStart = String(formData.get("week_start") ?? "").trim() || undefined;
  const weekEnd = String(formData.get("week_end") ?? "").trim() || undefined;
  if (!athleteId) {
    throw new Error("adminGenerateWeeklyReview: athlete_id required");
  }

  await generateWeeklyReviewForAthlete(athleteId, {
    force,
    weekStartIso: weekStart,
    weekEndIso: weekEnd,
  });

  revalidatePath("/app/admin");
}
