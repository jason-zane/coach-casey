"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/auth";
import { recordAuditEvent } from "@/lib/audit/log";
import { generateWeeklyReviewForAthlete } from "@/app/actions/weekly-review";
import { generateDebriefForActivity } from "@/lib/server/debrief-pipeline";
import { generateCrossTrainingAckForActivity } from "@/lib/server/cross-training-pipeline";
import { classifyActivityType } from "@/lib/strava/activity-types";

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

  await recordAuditEvent({
    actorType: "admin",
    actorId: gate.user.id,
    actorEmail: gate.user.email ?? null,
    action: "admin.toggle_test_user",
    targetAthleteId: athleteId,
    metadata: { target },
  });

  revalidatePath("/app/admin");
}

const ACCESS_STATUSES = ["pending", "invited", "joined", "declined"] as const;

/**
 * Set the status of an early-access request from the admin surface:
 * pending -> invited (you sent the link) -> joined (they signed up), or
 * declined. Records who handled it and when; setting back to pending clears
 * the handled fields.
 */
export async function setAccessRequestStatus(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate.ok) redirect(gate.redirect);

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (
    !id ||
    !ACCESS_STATUSES.includes(status as (typeof ACCESS_STATUSES)[number])
  ) {
    throw new Error("setAccessRequestStatus: id and valid status required");
  }

  const handled = status !== "pending";
  const admin = createAdminClient();
  const { error } = await admin
    .from("access_requests")
    .update({
      status,
      handled_at: handled ? new Date().toISOString() : null,
      handled_by: handled ? gate.user.id : null,
    })
    .eq("id", id);
  if (error) throw error;

  await recordAuditEvent({
    actorType: "admin",
    actorId: gate.user.id,
    actorEmail: gate.user.email ?? null,
    action: "admin.set_access_request_status",
    metadata: { id, status },
  });

  revalidatePath("/app/admin/access");
}

/**
 * Manually trigger a weekly review for an athlete, bypassing the
 * cron's local-time gate (Sunday evening by default). Used to seed
 * friends who joined mid-week with a first review immediately, or to
 * re-fire when the cron missed an athlete due to outage. Without
 * explicit week bounds it covers the week ending at the most recent
 * athlete-local Sunday, today included, matching what the cron would
 * send.
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

  await recordAuditEvent({
    actorType: "admin",
    actorId: gate.user.id,
    actorEmail: gate.user.email ?? null,
    action: "admin.generate_weekly_review",
    targetAthleteId: athleteId,
    metadata: { force, weekStart: weekStart ?? null, weekEnd: weekEnd ?? null },
  });

  revalidatePath("/app/admin");
}

/**
 * Force-regenerate the debrief (or cross-training ack) for the most
 * recent activity owned by this athlete. The 30-min cron only scans the
 * last 48h, so when a debrief is missing for an older activity (a
 * webhook drop coinciding with a deploy bounce or transient LLM
 * failure), the cron can't recover it. This action lets an admin
 * recover that activity by hand.
 *
 * Always passes `force: true` so it both creates a missing debrief and
 * replaces a stale one.
 */
export async function adminRegenerateLatestDebrief(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate.ok) redirect(gate.redirect);

  const athleteId = String(formData.get("athlete_id") ?? "").trim();
  if (!athleteId) {
    throw new Error("adminRegenerateLatestDebrief: athlete_id required");
  }

  const admin = createAdminClient();
  const { data: latest } = await admin
    .from("activities")
    .select("id, activity_type")
    .eq("athlete_id", athleteId)
    .order("start_date_local", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; activity_type: string | null }>();

  if (!latest) {
    throw new Error("adminRegenerateLatestDebrief: athlete has no activities");
  }

  const cls = classifyActivityType(latest.activity_type);
  try {
    if (cls === "run") {
      await generateDebriefForActivity(athleteId, latest.id, { force: true });
    } else if (cls === "cross_training" || cls === "catch_all") {
      await generateCrossTrainingAckForActivity(athleteId, latest.id, { force: true });
    } else {
      throw new Error(
        `adminRegenerateLatestDebrief: latest activity ${latest.id} is type ${latest.activity_type}, no handler`,
      );
    }
  } catch (err) {
    const e = err as { status?: number; message?: string; error?: unknown };
    const detail = JSON.stringify(
      {
        status: e?.status,
        message: e?.message,
        anthropicError: e?.error,
      },
      null,
      0,
    );
    console.error("[admin-regen-debrief] failed", {
      athleteId,
      activityId: latest.id,
      activityType: latest.activity_type,
      classification: cls,
      detail,
    });
    redirect(
      `/app/admin?regen_error=${encodeURIComponent(detail.slice(0, 1500))}`,
    );
  }

  await recordAuditEvent({
    actorType: "admin",
    actorId: gate.user.id,
    actorEmail: gate.user.email ?? null,
    action: "admin.regenerate_debrief",
    targetAthleteId: athleteId,
    metadata: { activityId: latest.id },
  });

  revalidatePath("/app/admin");
}
