import { createAdminClient } from "@/lib/supabase/server";
import { fetchActivitiesWindow } from "./client";
import { classifyActivityType } from "./activity-types";
import { mapStravaActivity } from "./ingest";
import { computeAndPersistMonthlyRollup } from "./history-rollup";

/**
 * Long-history Strava backfill. Distinct from the foreground ingest in
 * `ingest.ts`, that one pulls 12 weeks with full lap detail during onboarding
 * for the validation step. This one pulls *summaries only* (no detail
 * endpoint) for a longer window so Casey can reason about volume, frequency,
 * and patterns over months/years without burning the per-run detail budget.
 *
 * Called from cron after onboarding completes. Resumable: a failed slice
 * sets status='error' and the next cron pass picks it up. Once a backfill
 * lands, a one-line note is posted to the chat thread and status flips to
 * 'done'.
 *
 * Bounded: the activity list is requested with both `after` (= floor) and
 * `before` (= now − 12 weeks) so this never overlaps the recent foreground
 * window. Without that bound, an upsert from list-only data would overwrite
 * the lap detail we already pulled for the last 12 weeks.
 */

const RECENT_WINDOW_WEEKS = 12;
const MAX_PAGES_PER_SLICE = 30;
const PAGE_SIZE = 100;

type BackfillFloor = "two_years" | "all_time";

function floorIsoFor(floor: BackfillFloor): string | null {
  if (floor === "all_time") return null;
  // 2 years back, anchored to start-of-day so the value is stable across
  // mid-day re-runs of the same backfill.
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Anchored at kickoff time so it doesn't drift on subsequent cron passes.
 * Without this anchor, a cron pass running a day after onboarding would push
 * the boundary forward by a day, causing summary upserts to overwrite lap
 * detail the foreground ingest already pulled for that overlap.
 */
function initialBeforeIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - RECENT_WINDOW_WEEKS * 7);
  return d.toISOString();
}

/**
 * Mark an athlete for a long-history backfill. Idempotent, calling twice
 * for the same floor doesn't re-run a finished backfill, and an in-progress
 * backfill is left alone. Use `floor: 'all_time'` to upgrade a 'done'
 * two-year backfill into a deeper one (e.g. on paywall conversion).
 */
export async function kickOffHistoryBackfill(
  athleteId: string,
  floor: BackfillFloor = "two_years",
): Promise<void> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("athletes")
    .select("history_backfill_status, history_backfill_floor_iso")
    .eq("id", athleteId)
    .maybeSingle();
  if (!row) return;
  const current = row as {
    history_backfill_status: string;
    history_backfill_floor_iso: string | null;
  };

  const desiredFloor = floorIsoFor(floor);
  // If we're already done with the same-or-deeper floor, no-op.
  if (current.history_backfill_status === "done") {
    if (floor === "two_years") return;
    // Upgrading to all_time: only re-run if the current floor isn't already
    // null (= all-time). desiredFloor for all_time is null.
    if (current.history_backfill_floor_iso === null) return;
  }
  // If a backfill is mid-flight, don't disturb it.
  if (current.history_backfill_status === "running") return;

  await admin
    .from("athletes")
    .update({
      history_backfill_status: "pending",
      history_backfill_floor_iso: desiredFloor,
      history_backfill_before_iso: initialBeforeIso(),
      history_backfill_started_at: null,
      history_backfill_completed_at: null,
      history_backfill_last_error: null,
    })
    .eq("id", athleteId);
}

/**
 * Run one slice of the backfill for a single athlete. Idempotent, the
 * upsert on (athlete_id, strava_id) prevents duplicates.
 *
 * The before-cursor anchored at kickoff (history_backfill_before_iso) keeps
 * each slice cleanly inside its own window. When a slice hits the page cap
 * (= more activities exist further back), the cursor is advanced backwards
 * to the oldest activity in the batch and status stays 'pending' so the
 * next cron pass continues where this one left off. Only when a slice
 * returns a non-full last page do we mark 'done'. Migrated rows that
 * predate the before-cursor column treat NULL as "use the recent
 * boundary" so legacy backfills are still resumable.
 *
 * Returns the number of rows upserted in this slice.
 */
export type BackfillSliceResult =
  | { status: "ok"; complete: boolean; rowsUpserted: number }
  | { status: "error"; complete: false; rowsUpserted: 0; error: string };

export async function runHistoryBackfillForAthlete(
  athleteId: string,
): Promise<BackfillSliceResult> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("athletes")
    .select("history_backfill_floor_iso, history_backfill_before_iso")
    .eq("id", athleteId)
    .maybeSingle();
  if (!row)
    return {
      status: "error",
      complete: false,
      rowsUpserted: 0,
      error: "no athlete",
    };
  const r = row as {
    history_backfill_floor_iso: string | null;
    history_backfill_before_iso: string | null;
  };
  const floorIso = r.history_backfill_floor_iso;
  // NULL before_iso happens for rows kicked off before the column existed
  // (legacy/preview/dev). Fall back to the recent boundary so they still
  // make progress. Subsequent slices will use the value we persist below.
  const beforeIso = r.history_backfill_before_iso ?? initialBeforeIso();

  await admin
    .from("athletes")
    .update({
      history_backfill_status: "running",
      history_backfill_started_at: new Date().toISOString(),
    })
    .eq("id", athleteId);

  try {
    const afterSeconds = floorIso
      ? Math.floor(new Date(floorIso).getTime() / 1000)
      : undefined;
    const beforeSeconds = Math.floor(new Date(beforeIso).getTime() / 1000);

    const activities = await fetchActivitiesWindow(athleteId, {
      afterSeconds,
      beforeSeconds,
      // 30 pages × 100 = 3000 activities. Two years of dedicated
      // marathoner training tops out around 700; this covers it
      // comfortably. Larger histories (all_time, very long-tenured
      // athletes) continue across cron passes via the before-cursor
      // walk-back below.
      maxPages: MAX_PAGES_PER_SLICE,
    });

    // Drop ambient types (Walk, etc.), same filter the foreground ingest
    // applies. Long history isn't useful if it's noise.
    const kept = activities.filter((a) => {
      const cls = classifyActivityType(a.sport_type ?? a.type);
      return cls === "run" || cls === "cross_training" || cls === "catch_all";
    });

    if (kept.length > 0) {
      const rows = kept.map((a) => mapStravaActivity(a, athleteId, null));
      const { error } = await admin
        .from("activities")
        .upsert(rows, { onConflict: "athlete_id,strava_id" });
      if (error) throw error;
    }

    // Hit the page cap → there's more older history beyond this slice.
    // Advance the cursor to the oldest activity in this batch (using the
    // *unfiltered* list so we don't skip a noise-only page) and leave
    // status as 'pending' so the next cron pass continues the walk.
    const hitCap = activities.length >= MAX_PAGES_PER_SLICE * PAGE_SIZE;
    if (hitCap) {
      // Strava returns activities most-recent-first within a paginated
      // window, so the *last* item is the oldest. Defensive sort in case
      // that ever changes.
      const oldest = [...activities].sort((a, b) =>
        a.start_date_local.localeCompare(b.start_date_local),
      )[0];
      await admin
        .from("athletes")
        .update({
          history_backfill_status: "pending",
          history_backfill_before_iso: oldest.start_date_local,
          history_backfill_last_error: null,
        })
        .eq("id", athleteId);
      return { status: "ok", complete: false, rowsUpserted: kept.length };
    }

    await admin
      .from("athletes")
      .update({
        history_backfill_status: "done",
        history_backfill_completed_at: new Date().toISOString(),
        history_backfill_last_error: null,
      })
      .eq("id", athleteId);

    // Compute the cached monthly rollup now that we have the full long-history
    // window in the activities table. Fire-and-forget at the call site (cron
    // already serialises per-athlete), and a failure here doesn't unwind the
    // backfill itself.
    try {
      await computeAndPersistMonthlyRollup(athleteId);
    } catch (e) {
      console.warn("monthly rollup compute failed (non-fatal)", athleteId, e);
    }

    return { status: "ok", complete: true, rowsUpserted: kept.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Backfill failed.";
    await admin
      .from("athletes")
      .update({
        history_backfill_status: "error",
        history_backfill_last_error: msg.slice(0, 500),
      })
      .eq("id", athleteId);
    return {
      status: "error",
      complete: false,
      rowsUpserted: 0,
      error: msg,
    };
  }
}

/**
 * Post a one-time chat message announcing the backfill is in. Called after
 * `runHistoryBackfillForAthlete` returns done. Best-effort; if the message
 * can't be posted we don't roll back the backfill.
 */
export async function announceBackfillComplete(
  athleteId: string,
  rowsUpserted: number,
): Promise<void> {
  if (rowsUpserted === 0) return;
  try {
    const admin = createAdminClient();

    // Find this athlete's thread. If they haven't opened /app yet, the
    // thread doesn't exist, the announcement will land naturally as part
    // of the welcome seed when they first arrive, since the seed reads
    // recent activity counts.
    const { data: thread } = await admin
      .from("threads")
      .select("id")
      .eq("athlete_id", athleteId)
      .maybeSingle();
    if (!thread) return;

    // Don't double-post. The message meta carries `backfill: true` so a
    // second cron-driven announcement no-ops cleanly.
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", thread.id)
      .eq("kind", "chat_casey")
      .contains("meta", { backfill: true });
    if ((count ?? 0) > 0) return;

    const { data: agg } = await admin
      .from("activities")
      .select("start_date_local")
      .eq("athlete_id", athleteId)
      .order("start_date_local", { ascending: true })
      .limit(1);
    const oldest =
      agg && agg.length > 0 ? new Date(agg[0].start_date_local as string) : null;
    const horizon = oldest ? formatHorizon(oldest) : "your earlier history";

    // Honest framing: summaries only for the deep history, full lap detail
    // for the recent window, and a clear handle for older runs ("ask me and
    // I can pull the detail fresh"). No more overclaiming knowledge Casey
    // does not yet have inside the chat context.
    const body =
      `Backfill is in. I’ve got summaries going back to ${horizon}, ` +
      `enough to read volume, frequency, and the shape of how you build. ` +
      `For the last twelve weeks I have full lap detail. ` +
      `Anything older, ask me and I can pull the detail from Strava if it matters.`;

    await admin.from("messages").insert({
      thread_id: thread.id,
      athlete_id: athleteId,
      kind: "chat_casey",
      body,
      meta: { backfill: true },
    });
  } catch (e) {
    console.warn("backfill announcement failed (non-fatal)", e);
  }
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatHorizon(oldest: Date): string {
  // Reads as "August 2024" style. Specific is more credible than vague
  // ("the last X years") and matches the rollup card the prompt sees.
  return `${MONTHS[oldest.getMonth()]} ${oldest.getFullYear()}`;
}
