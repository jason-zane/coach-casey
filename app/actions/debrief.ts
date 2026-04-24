"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { buildDebriefContext } from "@/lib/thread/debrief-context";
import { debriefGate, generateDebrief } from "@/lib/llm/debrief";
import { ensureThread } from "@/lib/thread/repository";
import type { DebriefSkipReason } from "@/lib/llm/debrief";

export type GenerateDebriefResult =
  | {
      kind: "created";
      debriefId: string;
      followUpId: string | null;
    }
  | {
      kind: "exists";
      debriefId: string;
    }
  | {
      kind: "skipped";
      reason: DebriefSkipReason;
    };

type ActivityOwnershipRow = {
  id: string;
  athlete_id: string;
};

async function findExistingDebrief(
  athleteId: string,
  activityId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("messages")
    .select("id")
    .eq("athlete_id", athleteId)
    .eq("kind", "debrief")
    .filter("meta->>activity_id", "eq", activityId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Generate and persist a debrief for a single activity. Idempotent — a
 * repeat call returns `{ kind: "exists" }` rather than producing a
 * duplicate message, backed by the partial unique index added in
 * `20260424150000_debrief_idempotency.sql`.
 *
 * Entry points:
 *  - Webhook (primary): Strava activity.create event, called from the async
 *    post-ACK work in `/api/strava/webhook`.
 *  - Cron (safety net): `/api/cron/strava-poll` picks up any recently
 *    ingested activity without a debrief.
 *  - Dev trigger: `/api/dev/debrief` for local testing against fixture data.
 *
 * This is a server action so it can also be invoked from other server-side
 * code (e.g. onboarding completion triggering a backfill debrief).
 */
export async function generateDebriefForActivity(
  athleteId: string,
  activityId: string,
  { force = false }: { force?: boolean } = {},
): Promise<GenerateDebriefResult> {
  const admin = createAdminClient();

  // Ownership check — the webhook path resolves athleteId from strava_athlete_id
  // and could in principle be passed a mismatching activity. Verify.
  const { data: ownership } = await admin
    .from("activities")
    .select("id, athlete_id")
    .eq("id", activityId)
    .maybeSingle<ActivityOwnershipRow>();
  if (!ownership || ownership.athlete_id !== athleteId) {
    throw new Error(`activity ${activityId} not owned by athlete ${athleteId}`);
  }

  if (!force) {
    const existing = await findExistingDebrief(athleteId, activityId);
    if (existing) return { kind: "exists", debriefId: existing };
  }

  const ctx = await buildDebriefContext(athleteId, activityId);

  // Gate first so we avoid paying for LLM on activities that shouldn't get a
  // debrief. `generateDebrief` also gates internally as a backstop.
  const preGate = debriefGate(ctx.activity);
  if (preGate) return { kind: "skipped", reason: preGate };

  const outcome = await generateDebrief(ctx);
  if (outcome.kind === "skip") {
    return { kind: "skipped", reason: outcome.reason };
  }

  const threadId = await ensureThread(athleteId);

  const debriefMeta = {
    activity_id: activityId,
    activity_date: ctx.activity.date,
    strava_id: ctx.activity.strava_id,
  };

  const { data: debriefRow, error: debriefErr } = await admin
    .from("messages")
    .insert({
      thread_id: threadId,
      athlete_id: athleteId,
      kind: "debrief",
      body: outcome.body,
      meta: debriefMeta,
    })
    .select("id")
    .single();

  if (debriefErr) {
    // 23505 = unique_violation on messages_debrief_per_activity_uniq.
    // Race with a concurrent webhook retry — resolve by returning the
    // winning row rather than surfacing the error.
    if ((debriefErr as { code?: string }).code === "23505") {
      const existing = await findExistingDebrief(athleteId, activityId);
      if (existing) return { kind: "exists", debriefId: existing };
    }
    throw debriefErr;
  }

  const debriefId = (debriefRow as { id: string }).id;

  let followUpId: string | null = null;
  if (outcome.followUp) {
    const { data: followRow, error: followErr } = await admin
      .from("messages")
      .insert({
        thread_id: threadId,
        athlete_id: athleteId,
        kind: "follow_up",
        body: outcome.followUp,
        meta: {
          activity_id: activityId,
          parent_id: debriefId,
        },
      })
      .select("id")
      .single();
    if (followErr) {
      // Follow-up failure should not roll back the debrief — the debrief is
      // the value; the follow-up is a nice-to-have.
      console.warn("follow-up insert failed; debrief already persisted", followErr);
    } else {
      followUpId = (followRow as { id: string }).id;
    }
  }

  return { kind: "created", debriefId, followUpId };
}
