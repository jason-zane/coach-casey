"use server";

import { createAdminClient } from "@/lib/supabase/server";
import {
  buildWeeklyReviewContext,
  computePreviousFullWeek,
} from "@/lib/thread/weekly-review-context";
import {
  generateWeeklyReview,
  WEEKLY_REVIEW_PROMPT_VERSION,
  type WeeklyReviewSkipReason,
} from "@/lib/llm/weekly-review";
import { ensureThread } from "@/lib/thread/repository";
import { sendPushToAthlete } from "@/lib/push/send";
import { leadFromBody } from "@/lib/push/lead-from-body";
import { MODELS } from "@/lib/llm/anthropic";

export type GenerateWeeklyReviewResult =
  | { kind: "created"; reviewId: string }
  | { kind: "exists"; reviewId: string }
  | { kind: "skipped"; reason: WeeklyReviewSkipReason };

/**
 * Idempotency: at most one weekly_review per athlete per (weekStartIso).
 * Looked up by meta->>week_start_iso instead of a unique index, the
 * existing partial-uniques on `messages` are debrief-keyed and adding
 * another would be over-coupled to one surface. The cron runs every hour
 * looking at the previous full week, so the existence check is the
 * cheaper and clearer guard.
 */
async function findExistingWeeklyReview(
  athleteId: string,
  weekStartIso: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("messages")
    .select("id")
    .eq("athlete_id", athleteId)
    .eq("kind", "weekly_review")
    .filter("meta->>week_start_iso", "eq", weekStartIso)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Generate and persist a weekly review for an athlete. Idempotent per
 * (athlete, weekStartIso). Returns `exists` when one already covers the
 * window, `skipped` when the gate fired (no activity), `created` when a
 * fresh review was inserted and the push notification fanned out.
 */
export async function generateWeeklyReviewForAthlete(
  athleteId: string,
  opts: {
    /** Override for backfills / dev. Defaults to "previous full week in athlete-local time". */
    weekStartIso?: string;
    weekEndIso?: string;
    force?: boolean;
  } = {},
): Promise<GenerateWeeklyReviewResult> {
  const admin = createAdminClient();

  const { data: athleteRow } = await admin
    .from("athletes")
    .select("timezone, deleted_at")
    .eq("id", athleteId)
    .maybeSingle();
  if (!athleteRow) {
    throw new Error(`athlete ${athleteId} not found`);
  }
  const athlete = athleteRow as { timezone: string | null; deleted_at: string | null };
  if (athlete.deleted_at) {
    return { kind: "skipped", reason: "athlete_inactive" };
  }

  const week =
    opts.weekStartIso && opts.weekEndIso
      ? { weekStartIso: opts.weekStartIso, weekEndIso: opts.weekEndIso }
      : computePreviousFullWeek(athlete.timezone);

  if (!opts.force) {
    const existing = await findExistingWeeklyReview(athleteId, week.weekStartIso);
    if (existing) return { kind: "exists", reviewId: existing };
  }

  const ctx = await buildWeeklyReviewContext({
    athleteId,
    weekStartIso: week.weekStartIso,
    weekEndIso: week.weekEndIso,
  });

  const outcome = await generateWeeklyReview(ctx);
  if (outcome.kind === "skip") {
    return { kind: "skipped", reason: outcome.reason };
  }

  if (opts.force) {
    const stale = await findExistingWeeklyReview(athleteId, week.weekStartIso);
    if (stale) {
      await admin.from("messages").delete().eq("id", stale);
    }
  }

  const threadId = await ensureThread(athleteId);
  const meta = {
    week_start_iso: week.weekStartIso,
    week_end_iso: week.weekEndIso,
    run_count: ctx.weekRunCount,
    run_km: Number(ctx.weekRunKm.toFixed(2)),
  };

  const { data: row, error } = await admin
    .from("messages")
    .insert({
      thread_id: threadId,
      athlete_id: athleteId,
      kind: "weekly_review",
      body: outcome.body,
      meta,
      model_version: MODELS.weeklyReview,
      prompt_version: WEEKLY_REVIEW_PROMPT_VERSION,
    })
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  const reviewId = (row as { id: string }).id;

  // Best-effort push, gated by master + per-kind toggle. Same shape as
  // debrief: lead is the opening sentence, tag scopes per-week so a
  // re-fire wouldn't stack on the lock screen.
  try {
    const { data: prefs } = await admin
      .from("preferences")
      .select("push_enabled, weekly_review_push_enabled")
      .eq("athlete_id", athleteId)
      .maybeSingle();
    const masterOn =
      (prefs as { push_enabled?: boolean } | null)?.push_enabled ?? false;
    const subOn =
      (prefs as { weekly_review_push_enabled?: boolean } | null)
        ?.weekly_review_push_enabled ?? true;
    if (masterOn && subOn) {
      await sendPushToAthlete(athleteId, {
        title: `Week of ${week.weekStartIso}`,
        body: leadFromBody(outcome.body),
        tag: `weekly-review:${week.weekStartIso}`,
        url: "/app",
      });
    }
  } catch (err) {
    console.warn("weekly-review push fanout failed", err);
  }

  return { kind: "created", reviewId };
}
