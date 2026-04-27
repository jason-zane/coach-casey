"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { buildDebriefContext } from "@/lib/thread/debrief-context";
import {
  debriefGate,
  generateDebrief,
  STRAVA_BLURB_SIGNATURE,
} from "@/lib/llm/debrief";
import { ensureThread } from "@/lib/thread/repository";
import type { DebriefSkipReason } from "@/lib/llm/debrief";
import { sendPushToAthlete } from "@/lib/push/send";
import { leadFromBody } from "@/lib/push/lead-from-body";
import { SONNET_MODEL } from "@/lib/llm/anthropic";
import { updateActivityDescriptionAppend } from "@/lib/strava/client";

const DEBRIEF_PROMPT_VERSION = "post-run-debrief@v1";
const FOLLOW_UP_PROMPT_VERSION = "post-run-followup-conversational@v1";

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

  // Stats are mirrored into meta so the message renderer can show a
  // consistent stat row (distance · time · pace · HR) without re-querying
  // activities on render. Missing values are persisted as null and the
  // renderer omits absent fields.
  const debriefMeta = {
    activity_id: activityId,
    activity_date: ctx.activity.date,
    strava_id: ctx.activity.strava_id,
    activity_type: ctx.activity.activityType,
    distance_km: ctx.activity.distanceKm,
    moving_time_s: ctx.activity.movingTimeS,
    avg_hr: ctx.activity.avgHr,
  };

  // Under `force`, the partial unique index would block re-inserting a
  // debrief for the same activity. Delete the existing debrief (and any
  // follow-up that points at it) so the insert below succeeds. Done after
  // generation, not before, so a failure in generateDebrief leaves the
  // existing debrief in place — only a successful regenerate replaces it.
  if (force) {
    const stale = await findExistingDebrief(athleteId, activityId);
    if (stale) {
      await admin
        .from("messages")
        .delete()
        .eq("athlete_id", athleteId)
        .eq("kind", "follow_up")
        .filter("meta->>parent_id", "eq", stale);
      await admin.from("messages").delete().eq("id", stale);
    }
  }

  const { data: debriefRow, error: debriefErr } = await admin
    .from("messages")
    .insert({
      thread_id: threadId,
      athlete_id: athleteId,
      kind: "debrief",
      body: outcome.body,
      meta: debriefMeta,
      model_version: SONNET_MODEL,
      prompt_version: DEBRIEF_PROMPT_VERSION,
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
        model_version: SONNET_MODEL,
        prompt_version: FOLLOW_UP_PROMPT_VERSION,
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

  // Best-effort Strava description append. Public-facing guerrilla
  // marketing surface: Casey's verdict + signature land at the tail of
  // the athlete's Strava description so anyone reading their feed sees
  // the line. Wrapped so any failure (Strava down, scope missing,
  // mock connection) never surfaces as a debrief failure. The helper
  // strips any previously-appended Casey block before re-writing, so
  // force-regen replaces rather than stacks; webhook retries that
  // produce identical text no-op via an exact-match check.
  if (outcome.stravaBlurb && ctx.activity.strava_id != null) {
    try {
      const appended = `${outcome.stravaBlurb}\n\n${STRAVA_BLURB_SIGNATURE}`;
      const result = await updateActivityDescriptionAppend(
        athleteId,
        ctx.activity.strava_id,
        appended,
        STRAVA_BLURB_SIGNATURE,
      );
      if (result.kind === "error") {
        console.warn(
          `strava description update failed for activity ${activityId}: ${result.message}`,
          { status: result.status },
        );
      }
    } catch (err) {
      console.warn("strava description update threw", err);
    }
  }

  // Best-effort push notification once the debrief is durably persisted.
  // Wrapped so a push failure can't surface as a debrief failure — the
  // debrief is the value, the notification is the alert. The lead text
  // mirrors the opening sentence of the debrief, so the notification
  // preview is itself useful even if the athlete doesn't open the app.
  // Gated by the master `push_enabled` flag and the per-kind
  // `debrief_push_enabled` toggle (default true).
  try {
    const { data: prefs } = await admin
      .from("preferences")
      .select("push_enabled, debrief_push_enabled")
      .eq("athlete_id", athleteId)
      .maybeSingle();
    const masterOn = (prefs as { push_enabled?: boolean } | null)?.push_enabled ?? false;
    const subOn =
      (prefs as { debrief_push_enabled?: boolean } | null)?.debrief_push_enabled ?? true;
    if (masterOn && subOn) {
      const lead = leadFromBody(outcome.body);
      await sendPushToAthlete(athleteId, {
        title: pushTitleForActivity(ctx.activity),
        body: lead,
        tag: `debrief:${activityId}`,
        url: "/app",
      });
    }
  } catch (err) {
    console.warn("debrief push fanout failed", err);
  }

  return { kind: "created", debriefId, followUpId };
}

function pushTitleForActivity(a: { name: string | null; distanceKm: number }): string {
  if (a.name && a.name.trim().length > 0) {
    return `Debrief: ${a.name.trim()}`;
  }
  // Fall back to a distance-anchored title rather than a generic "Debrief"
  // so notification stacks on the lock screen are skim-able.
  const km = a.distanceKm > 0 ? `${a.distanceKm.toFixed(1)} km` : null;
  return km ? `Debrief: ${km}` : "Debrief";
}
