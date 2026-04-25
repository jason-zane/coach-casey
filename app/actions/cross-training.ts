"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { buildCrossTrainingContext } from "@/lib/thread/cross-training-context";
import {
  generateCrossTrainingAck,
  CROSS_TRAINING_PROMPT_VERSION,
  type CrossTrainingSkipReason,
} from "@/lib/llm/cross-training";
import { SONNET_MODEL } from "@/lib/llm/anthropic";
import { ensureThread } from "@/lib/thread/repository";
import { sendPushToAthlete } from "@/lib/push/send";
import { shouldGenerateCrossTrainingAck } from "@/lib/strava/activity-types";

/**
 * 24-hour retroactive guard. Activities synced more than this old are
 * stored as ambient context but produce no thread message — a debrief
 * arriving for a 5-day-old activity is jarring and stale (see
 * docs/cross-training.md §11.4).
 */
const RETROACTIVE_GUARD_HOURS = 24;

export type GenerateCrossTrainingAckResult =
  | { kind: "created"; messageId: string; isSubstitution: boolean }
  | { kind: "exists"; messageId: string }
  | { kind: "skipped"; reason: CrossTrainingSkipReason | "retroactive" | "wrong_type" | "deleted_athlete" };

type ActivityRow = {
  id: string;
  athlete_id: string;
  activity_type: string | null;
  start_date_local: string;
};

async function findExistingAck(
  athleteId: string,
  activityId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("messages")
    .select("id")
    .eq("athlete_id", athleteId)
    .in("kind", ["cross_training_ack", "cross_training_substitution"])
    .filter("meta->>activity_id", "eq", activityId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Generate and persist a cross-training acknowledgement for a single
 * activity. Idempotent — a repeat call returns `{ kind: "exists" }`
 * rather than producing a duplicate message, backed by the partial unique
 * index added in `20260425120000_cross_training_indexes.sql`.
 *
 * Entry points:
 *  - Webhook (primary): Strava activity.create event for a non-run type.
 *  - Cron (safety net): `/api/cron/strava-poll` picks up missed activities.
 *  - Dev trigger: `/api/dev/cross-training` for local testing.
 *
 * Substitution detection is dormant in V1 — `planned_sessions` doesn't
 * exist yet (plans are stored as raw text). When plan extraction lands,
 * the substitution check fires here and the message is persisted with
 * kind = 'cross_training_substitution'. For now every ack is the standard
 * variant.
 */
export async function generateCrossTrainingAckForActivity(
  athleteId: string,
  activityId: string,
  { force = false }: { force?: boolean } = {},
): Promise<GenerateCrossTrainingAckResult> {
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("activities")
    .select("id, athlete_id, activity_type, start_date_local")
    .eq("id", activityId)
    .maybeSingle<ActivityRow>();
  if (!row || row.athlete_id !== athleteId) {
    throw new Error(`activity ${activityId} not owned by athlete ${athleteId}`);
  }

  if (!shouldGenerateCrossTrainingAck(row.activity_type)) {
    return { kind: "skipped", reason: "wrong_type" };
  }

  // Retroactive guard. Skip when the activity is older than the window
  // unless the caller is force-regenerating (dev path).
  if (!force) {
    const ageMs = Date.now() - new Date(row.start_date_local).getTime();
    if (ageMs > RETROACTIVE_GUARD_HOURS * 60 * 60 * 1000) {
      return { kind: "skipped", reason: "retroactive" };
    }
  }

  if (!force) {
    const existing = await findExistingAck(athleteId, activityId);
    if (existing) return { kind: "exists", messageId: existing };
  }

  // Substitution detection is dormant — see file header. When ready,
  // populate `isSubstitution` from a planned_sessions query here.
  const isSubstitution = false;

  const ctx = await buildCrossTrainingContext(athleteId, activityId);
  const outcome = await generateCrossTrainingAck(ctx, { isSubstitution });
  if (outcome.kind === "skip") {
    return { kind: "skipped", reason: outcome.reason };
  }

  const threadId = await ensureThread(athleteId);

  const meta = {
    activity_id: activityId,
    activity_type: row.activity_type,
    activity_date: row.start_date_local,
    is_pattern: ctx.pattern.isPattern,
    pattern_description: ctx.pattern.description,
    is_substitution: outcome.isSubstitution,
  };

  // Force regeneration replaces the existing row — same rule the debrief
  // pipeline applies. Done after generation, not before, so a generation
  // failure leaves the prior ack in place.
  if (force) {
    const stale = await findExistingAck(athleteId, activityId);
    if (stale) {
      await admin.from("messages").delete().eq("id", stale);
    }
  }

  const { data: inserted, error: insertErr } = await admin
    .from("messages")
    .insert({
      thread_id: threadId,
      athlete_id: athleteId,
      kind: outcome.isSubstitution ? "cross_training_substitution" : "cross_training_ack",
      body: outcome.body,
      meta,
      model_version: SONNET_MODEL,
      prompt_version: CROSS_TRAINING_PROMPT_VERSION,
    })
    .select("id")
    .single();

  if (insertErr) {
    // 23505 = unique_violation on the partial unique index. Race with a
    // concurrent webhook retry — return the winning row.
    if ((insertErr as { code?: string }).code === "23505") {
      const existing = await findExistingAck(athleteId, activityId);
      if (existing) return { kind: "exists", messageId: existing };
    }
    throw insertErr;
  }

  const messageId = (inserted as { id: string }).id;

  // Push notification, gated by the per-kind toggle. Master `push_enabled`
  // gate applies inside the send path through the subscriptions check —
  // an athlete with no subscriptions silently no-ops.
  try {
    const { data: prefs } = await admin
      .from("preferences")
      .select("push_enabled, cross_training_push_enabled")
      .eq("athlete_id", athleteId)
      .maybeSingle();
    const masterOn = (prefs as { push_enabled?: boolean } | null)?.push_enabled ?? false;
    const subOn =
      (prefs as { cross_training_push_enabled?: boolean } | null)?.cross_training_push_enabled ??
      true;
    if (masterOn && subOn) {
      const lead = leadFromBody(outcome.body);
      await sendPushToAthlete(athleteId, {
        title: pushTitleForActivity(row.activity_type),
        body: lead,
        tag: `cross_training:${activityId}`,
        url: "/app",
      });
    }
  } catch (err) {
    console.warn("cross-training push fanout failed", err);
  }

  return { kind: "created", messageId, isSubstitution: outcome.isSubstitution };
}

/**
 * First sentence (or first ~140 chars) of the body. Push payloads are
 * tight; clipping here keeps the lead readable on lock screens.
 */
function leadFromBody(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  const sentenceEnd = trimmed.search(/(?<=[.!?])\s/);
  const lead = sentenceEnd > 0 ? trimmed.slice(0, sentenceEnd) : trimmed;
  if (lead.length <= 140) return lead;
  return lead.slice(0, 137).trimEnd() + "…";
}

function pushTitleForActivity(activityType: string | null): string {
  const map: Record<string, string> = {
    Ride: "Ride",
    VirtualRide: "Ride",
    EBikeRide: "Ride",
    Swim: "Swim",
    Workout: "Gym",
    WeightTraining: "Gym",
    Yoga: "Yoga",
    Pilates: "Pilates",
  };
  const label = activityType && map[activityType] ? map[activityType] : "Cross-training";
  return `Coach Casey: ${label}`;
}
