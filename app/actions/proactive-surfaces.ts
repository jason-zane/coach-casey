"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { ensureThread } from "@/lib/thread/repository";
import { MODELS } from "@/lib/llm/anthropic";
import { sendPushToAthlete } from "@/lib/push/send";
import { leadFromBody } from "@/lib/push/lead-from-body";
import {
  FUELING_PRERUN_PROMPT_VERSION,
  FUELING_RETROSPECTIVE_PROMPT_VERSION,
  MID_BLOCK_FLATNESS_PROMPT_VERSION,
  NIGGLE_ESCALATION_PROMPT_VERSION,
  RACE_WEEK_BRIEFING_PROMPT_VERSION,
  generateFuelingPrerunNudge,
  generateFuelingRetrospective,
  generateMidBlockFlatness,
  generateNiggleEscalation,
  generateRaceWeekBriefing,
  type FuelingPrerunContext,
  type FuelingRetrospectiveContext,
  type MidBlockFlatnessContext,
  type NiggleEscalationContext,
  type RaceWeekContext,
} from "@/lib/llm/proactive-surfaces";

/**
 * Server actions for the five proactive surfaces added in the
 * 2026-05-16 Casey refresh.
 *
 * Each action is responsible for:
 *   1. Idempotency. A prior message with the same surface + key meta
 *      means we don't re-fire. Each surface picks its own key.
 *   2. Calling the generator (mock-aware via lib/llm/mocks.ts).
 *   3. Inserting the message into the thread with kind 'casey_briefing'
 *      and a meta payload that includes the surface name and the
 *      idempotency key.
 *
 * Generators stay free of next/server imports; the persistence shape
 * sits here so call sites (cron routes, webhook hooks) can call one
 * function per surface and get the full pipeline.
 */

type ActionResult =
  | { kind: "created"; messageId: string }
  | { kind: "exists"; messageId: string }
  | { kind: "skipped"; reason: string };

// ---------------------------------------------------------------------------
// Idempotency helpers
//
// Each surface scopes its own idempotency by the message kind +
// meta.surface + a surface-specific key (race id + day marker, planned
// run id, etc). Looked up via JSONB filter; cardinality is low so the
// thread index covers the scan.

async function findExistingBriefing(
  athleteId: string,
  surface: string,
  metaFilter: Array<{ key: string; value: string }>,
): Promise<string | null> {
  const admin = createAdminClient();
  let q = admin
    .from("messages")
    .select("id")
    .eq("athlete_id", athleteId)
    .eq("kind", "casey_briefing")
    .filter("meta->>surface", "eq", surface);
  for (const { key, value } of metaFilter) {
    q = q.filter(`meta->>${key}`, "eq", value);
  }
  const { data } = await q.maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function insertBriefing(
  athleteId: string,
  body: string,
  meta: Record<string, unknown>,
  promptVersion: string,
  modelVersion: string,
  push: { title: string; tag: string } | null,
): Promise<string> {
  const admin = createAdminClient();
  const threadId = await ensureThread(athleteId);
  const { data, error } = await admin
    .from("messages")
    .insert({
      thread_id: threadId,
      athlete_id: athleteId,
      kind: "casey_briefing",
      body,
      meta,
      model_version: modelVersion,
      prompt_version: promptVersion,
    })
    .select("id")
    .single();
  if (error) throw error;
  const messageId = (data as { id: string }).id;

  if (push) {
    try {
      const { data: prefs } = await admin
        .from("preferences")
        .select("push_enabled, briefing_push_enabled")
        .eq("athlete_id", athleteId)
        .maybeSingle();
      const masterOn =
        (prefs as { push_enabled?: boolean } | null)?.push_enabled ?? false;
      const subOn =
        (prefs as { briefing_push_enabled?: boolean } | null)
          ?.briefing_push_enabled ?? true;
      if (masterOn && subOn) {
        await sendPushToAthlete(athleteId, {
          title: push.title,
          body: leadFromBody(body),
          tag: push.tag,
          url: "/app",
        });
      }
    } catch (err) {
      console.warn("briefing push fanout failed", err);
    }
  }

  return messageId;
}

// ---------------------------------------------------------------------------
// Race-week briefing

export async function fireRaceWeekBriefing(
  ctx: RaceWeekContext & { raceId: string },
): Promise<ActionResult> {
  const existing = await findExistingBriefing(ctx.athleteId, "race-week-briefing", [
    { key: "race_id", value: ctx.raceId },
    { key: "day_marker", value: ctx.dayMarker },
  ]);
  if (existing) return { kind: "exists", messageId: existing };

  const body = await generateRaceWeekBriefing(ctx);
  if (!body) return { kind: "skipped", reason: "generator_skip" };

  const messageId = await insertBriefing(
    ctx.athleteId,
    body,
    {
      surface: "race-week-briefing",
      race_id: ctx.raceId,
      day_marker: ctx.dayMarker,
      tier: ctx.tier,
      race_date: ctx.raceDate,
    },
    RACE_WEEK_BRIEFING_PROMPT_VERSION,
    MODELS.raceWeekBriefing,
    {
      title: ctx.raceName ? `${ctx.dayMarker}: ${ctx.raceName}` : `Race ${ctx.dayMarker}`,
      tag: `race-week:${ctx.raceId}:${ctx.dayMarker}`,
    },
  );
  return { kind: "created", messageId };
}

// ---------------------------------------------------------------------------
// Fuelling pre-run

export async function fireFuelingPrerun(
  ctx: FuelingPrerunContext & {
    /**
     * Stable key for the planned run (e.g. plan-line id, or
     * `${athlete}-${date}-long`). Used for idempotency so we don't
     * nudge twice for the same planned run.
     */
    plannedRunKey: string;
  },
): Promise<ActionResult> {
  const existing = await findExistingBriefing(ctx.athleteId, "fueling-prerun", [
    { key: "planned_run_key", value: ctx.plannedRunKey },
  ]);
  if (existing) return { kind: "exists", messageId: existing };

  const body = await generateFuelingPrerunNudge(ctx);
  if (!body) return { kind: "skipped", reason: "generator_skip" };

  const messageId = await insertBriefing(
    ctx.athleteId,
    body,
    {
      surface: "fueling-prerun",
      planned_run_key: ctx.plannedRunKey,
      planned_run_day: ctx.plannedRunDay,
      duration_minutes: ctx.plannedDurationMinutes,
    },
    FUELING_PRERUN_PROMPT_VERSION,
    MODELS.fuelingPrerun,
    { title: "Long run tomorrow", tag: `fuel-prerun:${ctx.plannedRunKey}` },
  );
  return { kind: "created", messageId };
}

// ---------------------------------------------------------------------------
// Fuelling retrospective

export async function fireFuelingRetrospective(
  ctx: FuelingRetrospectiveContext & { activityId: string },
): Promise<ActionResult> {
  const existing = await findExistingBriefing(
    ctx.athleteId,
    "fueling-retrospective",
    [{ key: "activity_id", value: ctx.activityId }],
  );
  if (existing) return { kind: "exists", messageId: existing };

  const body = await generateFuelingRetrospective(ctx);
  if (!body) return { kind: "skipped", reason: "generator_skip" };

  const messageId = await insertBriefing(
    ctx.athleteId,
    body,
    {
      surface: "fueling-retrospective",
      activity_id: ctx.activityId,
      duration_minutes: ctx.runDurationMinutes,
    },
    FUELING_RETROSPECTIVE_PROMPT_VERSION,
    MODELS.fuelingRetrospective,
    { title: "Fuelling check", tag: `fuel-retro:${ctx.activityId}` },
  );
  return { kind: "created", messageId };
}

// ---------------------------------------------------------------------------
// Niggle escalation
//
// Re-escalation gate: don't re-fire for the same body part within 14
// days of the last escalation message.

export async function fireNiggleEscalation(
  ctx: NiggleEscalationContext,
): Promise<ActionResult> {
  const admin = createAdminClient();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
  const { data: recent } = await admin
    .from("messages")
    .select("id")
    .eq("athlete_id", ctx.athleteId)
    .eq("kind", "casey_briefing")
    .filter("meta->>surface", "eq", "niggle-escalation")
    .filter("meta->>body_part", "eq", ctx.bodyPart)
    .gte("created_at", fourteenDaysAgo)
    .maybeSingle();
  if (recent) {
    return { kind: "exists", messageId: (recent as { id: string }).id };
  }

  const body = await generateNiggleEscalation(ctx);
  if (!body) return { kind: "skipped", reason: "generator_skip" };

  const messageId = await insertBriefing(
    ctx.athleteId,
    body,
    {
      surface: "niggle-escalation",
      body_part: ctx.bodyPart,
      mentions_in_window: ctx.mentionsInWindow,
      window_days: ctx.windowDays,
    },
    NIGGLE_ESCALATION_PROMPT_VERSION,
    MODELS.niggleEscalation,
    { title: `${ctx.bodyPart}, worth a look`, tag: `niggle:${ctx.bodyPart}` },
  );
  return { kind: "created", messageId };
}

// ---------------------------------------------------------------------------
// Mid-block flatness check-in
//
// Re-firing gate: at most one flatness check-in per athlete per
// rolling 14 days. Pattern continuation past that window is allowed to
// re-fire.

export async function fireMidBlockFlatness(
  ctx: MidBlockFlatnessContext,
): Promise<ActionResult> {
  const admin = createAdminClient();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
  const { data: recent } = await admin
    .from("messages")
    .select("id")
    .eq("athlete_id", ctx.athleteId)
    .eq("kind", "casey_briefing")
    .filter("meta->>surface", "eq", "mid-block-flatness")
    .gte("created_at", fourteenDaysAgo)
    .maybeSingle();
  if (recent) {
    return { kind: "exists", messageId: (recent as { id: string }).id };
  }

  const body = await generateMidBlockFlatness(ctx);
  if (!body) return { kind: "skipped", reason: "generator_skip" };

  const messageId = await insertBriefing(
    ctx.athleteId,
    body,
    {
      surface: "mid-block-flatness",
      pattern_description: ctx.patternDescription,
    },
    MID_BLOCK_FLATNESS_PROMPT_VERSION,
    MODELS.midBlockFlatness,
    { title: "Worth a quick check", tag: `flatness:${ctx.athleteId}` },
  );
  return { kind: "created", messageId };
}
