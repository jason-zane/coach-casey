import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { countConsecutiveSkips } from "./skip-count";
import {
  PAUSE_DURATION_MS,
  PAUSE_THRESHOLD_SKIPS,
  RPE_MAX,
  RPE_MIN,
  type DebriefRpeMeta,
  type RpeState,
} from "./types";
import { isEligibleActivity, type EligibilityActivity } from "./eligibility";

type ActivityNoteRow = {
  activity_id: string;
  rpe_value: number | null;
  rpe_prompted_at: string | null;
  rpe_answered_at: string | null;
  rpe_skipped_at: string | null;
};

/**
 * Resolve the activity_id for an RPE write and verify ownership. Throws
 * on mismatch — RPE writes only ever come from the signed-in athlete's
 * own server action path, so an ownership failure is genuinely
 * exceptional, not a normal-flow error.
 */
async function assertActivityOwnership(
  athleteId: string,
  activityId: string,
): Promise<EligibilityActivity> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activities")
    .select("athlete_id, activity_type, moving_time_s")
    .eq("id", activityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`activity ${activityId} not found`);
  const row = data as {
    athlete_id: string;
    activity_type: string | null;
    moving_time_s: number | null;
  };
  if (row.athlete_id !== athleteId) {
    throw new Error(`activity ${activityId} not owned by athlete ${athleteId}`);
  }
  return { activityType: row.activity_type, movingTimeS: row.moving_time_s };
}

async function loadAthletePauseState(
  athleteId: string,
): Promise<{ pausedUntil: string | null; anchorAt: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("athletes")
    .select("rpe_prompts_paused_until, rpe_skip_count_anchor_at")
    .eq("id", athleteId)
    .single();
  if (error) throw error;
  return {
    pausedUntil:
      (data as { rpe_prompts_paused_until: string | null }).rpe_prompts_paused_until,
    anchorAt:
      (data as { rpe_skip_count_anchor_at: string | null }).rpe_skip_count_anchor_at,
  };
}

function isPaused(pausedUntil: string | null): boolean {
  if (!pausedUntil) return false;
  return new Date(pausedUntil).getTime() > Date.now();
}

function rowToState(row: ActivityNoteRow | null): RpeState {
  if (!row) return { kind: "unanswered" };
  if (row.rpe_value !== null && row.rpe_answered_at !== null) {
    return { kind: "answered", value: row.rpe_value, answeredAt: row.rpe_answered_at };
  }
  if (row.rpe_skipped_at !== null) {
    return { kind: "skipped", skippedAt: row.rpe_skipped_at };
  }
  return { kind: "unanswered" };
}

/**
 * Fetch (or create-if-missing) the activity_notes row for an activity.
 * Used as a building block — does not enforce ownership; callers do that
 * one level up so the check happens once per server-action call.
 */
async function ensureActivityNote(
  athleteId: string,
  activityId: string,
): Promise<ActivityNoteRow> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("activity_notes")
    .select("activity_id, rpe_value, rpe_prompted_at, rpe_answered_at, rpe_skipped_at")
    .eq("activity_id", activityId)
    .maybeSingle();
  if (existing) return existing as ActivityNoteRow;

  const { data: inserted, error: insertErr } = await admin
    .from("activity_notes")
    .insert({ activity_id: activityId, athlete_id: athleteId })
    .select("activity_id, rpe_value, rpe_prompted_at, rpe_answered_at, rpe_skipped_at")
    .single();
  if (insertErr) {
    // 23505 = unique_violation — a parallel insert won the race; fetch
    // the row that did land.
    if ((insertErr as { code?: string }).code === "23505") {
      const { data: race } = await admin
        .from("activity_notes")
        .select(
          "activity_id, rpe_value, rpe_prompted_at, rpe_answered_at, rpe_skipped_at",
        )
        .eq("activity_id", activityId)
        .single();
      return race as ActivityNoteRow;
    }
    throw insertErr;
  }
  return inserted as ActivityNoteRow;
}

/**
 * Look up RPE meta for a batch of debrief messages keyed by activity_id.
 * Used by the thread fetch path to enrich each debrief message with
 * eligibility + state in one round-trip.
 */
export async function loadDebriefRpeMetaBatch(
  athleteId: string,
  activityIds: string[],
): Promise<Map<string, DebriefRpeMeta>> {
  if (activityIds.length === 0) return new Map();

  const admin = createAdminClient();
  const [activitiesRes, notesRes, pauseRes] = await Promise.all([
    admin
      .from("activities")
      .select("id, activity_type, moving_time_s")
      .eq("athlete_id", athleteId)
      .in("id", activityIds),
    admin
      .from("activity_notes")
      .select("activity_id, rpe_value, rpe_prompted_at, rpe_answered_at, rpe_skipped_at")
      .eq("athlete_id", athleteId)
      .in("activity_id", activityIds),
    loadAthletePauseState(athleteId),
  ]);
  if (activitiesRes.error) throw activitiesRes.error;
  if (notesRes.error) throw notesRes.error;

  const paused = isPaused(pauseRes.pausedUntil);

  const activities = new Map<string, EligibilityActivity>();
  for (const a of (activitiesRes.data ?? []) as Array<{
    id: string;
    activity_type: string | null;
    moving_time_s: number | null;
  }>) {
    activities.set(a.id, { activityType: a.activity_type, movingTimeS: a.moving_time_s });
  }

  const notes = new Map<string, ActivityNoteRow>();
  for (const n of (notesRes.data ?? []) as ActivityNoteRow[]) {
    notes.set(n.activity_id, n);
  }

  const out = new Map<string, DebriefRpeMeta>();
  for (const id of activityIds) {
    const activity = activities.get(id);
    if (!activity) continue; // ownership filtered out.
    const note = notes.get(id) ?? null;
    const state = rowToState(note);
    // Eligibility: shape gate, plus the pause flag (only suppresses the
    // initial prompt — once a row has been answered/skipped, it stays
    // visible in its terminal state).
    const shapeOk = isEligibleActivity(activity);
    const eligible = shapeOk && (state.kind !== "unanswered" || !paused);
    out.set(id, { eligible, state });
  }
  return out;
}

/**
 * Idempotently mark a prompt as displayed. Called from the client the
 * first time the picker enters view. Sets `rpe_prompted_at = NOW()` only
 * if the prompt has neither been answered nor explicitly skipped — once
 * the row has reached a terminal state, the prompted-at stamp is fixed.
 */
export async function markRpePrompted(
  athleteId: string,
  activityId: string,
): Promise<void> {
  await assertActivityOwnership(athleteId, activityId);
  const note = await ensureActivityNote(athleteId, activityId);
  if (note.rpe_prompted_at) return;
  if (note.rpe_answered_at || note.rpe_skipped_at) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("activity_notes")
    .update({ rpe_prompted_at: new Date().toISOString() })
    .eq("activity_id", activityId)
    .is("rpe_prompted_at", null);
  if (error) throw error;
}

export type RpeSubmitResult = {
  state: RpeState;
};

/**
 * Record an RPE answer. The picker is fixed — the spec deliberately
 * disallows edits in V1 — so this no-ops when the row has already been
 * answered or skipped. Validation lives here, not at the client edge,
 * so an out-of-range value fails fast even if a request is hand-crafted.
 */
export async function submitRpe(
  athleteId: string,
  activityId: string,
  value: number,
): Promise<RpeSubmitResult> {
  if (!Number.isInteger(value) || value < RPE_MIN || value > RPE_MAX) {
    throw new Error(`invalid RPE value: ${value}`);
  }
  await assertActivityOwnership(athleteId, activityId);
  const note = await ensureActivityNote(athleteId, activityId);

  if (note.rpe_value !== null) {
    return { state: rowToState(note) };
  }
  if (note.rpe_skipped_at !== null) {
    // Already skipped — V1 doesn't allow promotion of a skip into an
    // answer. Return current state without mutation.
    return { state: rowToState(note) };
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activity_notes")
    .update({
      rpe_value: value,
      rpe_answered_at: now,
      // Backfill prompted_at if the client never managed to mark it
      // (rare — flaky network at first paint). Without this, the row
      // never enters the consecutive-skip pool.
      rpe_prompted_at: note.rpe_prompted_at ?? now,
    })
    .eq("activity_id", activityId)
    .is("rpe_answered_at", null)
    .is("rpe_skipped_at", null)
    .select("activity_id, rpe_value, rpe_prompted_at, rpe_answered_at, rpe_skipped_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    // Lost the optimistic-concurrency check — re-read state.
    const fresh = await ensureActivityNote(athleteId, activityId);
    return { state: rowToState(fresh) };
  }
  return { state: rowToState(data as ActivityNoteRow) };
}

export type RpeSkipResult = {
  state: RpeState;
  paused: boolean;
};

/**
 * Record an explicit skip and, if this skip pushes the consecutive count
 * to the threshold, set the pause flag. Returns whether the pause was
 * just applied so the client can surface a confirmation if it wants to.
 */
export async function skipRpe(
  athleteId: string,
  activityId: string,
): Promise<RpeSkipResult> {
  await assertActivityOwnership(athleteId, activityId);
  const note = await ensureActivityNote(athleteId, activityId);

  if (note.rpe_value !== null || note.rpe_skipped_at !== null) {
    return { state: rowToState(note), paused: false };
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activity_notes")
    .update({
      rpe_skipped_at: now,
      rpe_prompted_at: note.rpe_prompted_at ?? now,
    })
    .eq("activity_id", activityId)
    .is("rpe_answered_at", null)
    .is("rpe_skipped_at", null)
    .select("activity_id, rpe_value, rpe_prompted_at, rpe_answered_at, rpe_skipped_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const fresh = await ensureActivityNote(athleteId, activityId);
    return { state: rowToState(fresh), paused: false };
  }

  const pause = await loadAthletePauseState(athleteId);
  const consecutive = await countConsecutiveSkips(athleteId, pause.anchorAt);
  if (consecutive >= PAUSE_THRESHOLD_SKIPS) {
    const pausedUntil = new Date(Date.now() + PAUSE_DURATION_MS).toISOString();
    await admin
      .from("athletes")
      .update({
        rpe_prompts_paused_until: pausedUntil,
        // Anchor counting forward of right now — the skips that triggered
        // this pause are consumed and shouldn't re-trigger immediately
        // when the pause expires.
        rpe_skip_count_anchor_at: now,
      })
      .eq("id", athleteId);
    return { state: rowToState(data as ActivityNoteRow), paused: true };
  }

  return { state: rowToState(data as ActivityNoteRow), paused: false };
}
