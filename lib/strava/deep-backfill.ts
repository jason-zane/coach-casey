import { createAdminClient } from "@/lib/supabase/server";
import { ensureActivityLapDetail } from "./lap-detail";

/**
 * Deep backfill: take summary-only activity rows from the long-history
 * backfill and fill in laps, splits, and best_efforts via the on-demand
 * `ensureActivityLapDetail` path (which goes through `mapStravaActivity` in
 * `deep` mode, so the trim and run-vs-ride rules are applied uniformly).
 *
 * Triggered on paid conversion in `app/actions/conversion.ts`. Paced
 * deliberately gently: at most SLICE_SIZE activities per cron pass, hourly
 * cron, so a typical 2-year backfill (500-700 activities) completes in ~6
 * days. That leaves comfortable headroom inside Strava's 100-reads-per-
 * 15-min / 1000-reads-per-day budget for the foreground 12-week ingest,
 * the chat refresh tool, and the on-demand history backfill cursor walk.
 *
 * Resumable across cron passes: the activities table is the cursor. A row
 * with `laps IS NULL` and start_date_local inside the deep-window is
 * pending; once `ensureActivityLapDetail` lands a deep fetch the row drops
 * out of the next slice's query.
 */

const SLICE_SIZE = 5;

// The deep-window matches what the chat prompt routes Casey through:
// older than 12 weeks (since the foreground ingest already has detail
// there) and within the last 2 years.
const FOREGROUND_WEEKS = 12;
const DEEP_WINDOW_YEARS = 2;

export const DEEP_BACKFILL_ANNOUNCEMENT_META_KEY = "deep_backfill";

function foregroundBoundaryIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - FOREGROUND_WEEKS * 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function deepFloorIso(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - DEEP_WINDOW_YEARS);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Count activities in the deep window that still need detail. Used at
 * kickoff to snapshot a target count, and useful for progress reads.
 */
async function countPendingDeepRows(athleteId: string): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("activities")
    .select("id", { count: "exact", head: true })
    .eq("athlete_id", athleteId)
    .lt("start_date_local", foregroundBoundaryIso())
    .gte("start_date_local", deepFloorIso())
    .is("laps", null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Queue a deep backfill for an athlete. Idempotent: a backfill that's already
 * `running` or `pending` is left alone, and a `done` backfill is re-queued
 * only when there are new summary rows to deepen (this happens when the
 * long-history backfill extends the window further back, e.g. on the
 * two_years → all_time upgrade).
 */
export async function kickOffDeepBackfill(athleteId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("athletes")
    .select("deep_backfill_status")
    .eq("id", athleteId)
    .maybeSingle();
  if (!row) return;
  const status = (row as { deep_backfill_status: string }).deep_backfill_status;
  if (status === "pending" || status === "running") return;

  const target = await countPendingDeepRows(athleteId);
  if (target === 0) {
    // Nothing to do, mark done so the cron query skips this athlete and the
    // announcement path doesn't fire on an empty backfill.
    await admin
      .from("athletes")
      .update({
        deep_backfill_status: "done",
        deep_backfill_target_count: 0,
        deep_backfill_processed_count: 0,
        deep_backfill_completed_at: new Date().toISOString(),
        deep_backfill_started_at: null,
        deep_backfill_last_error: null,
      })
      .eq("id", athleteId);
    return;
  }

  await admin
    .from("athletes")
    .update({
      deep_backfill_status: "pending",
      deep_backfill_target_count: target,
      deep_backfill_processed_count: 0,
      deep_backfill_started_at: null,
      deep_backfill_completed_at: null,
      deep_backfill_last_error: null,
    })
    .eq("id", athleteId);
}

export type DeepBackfillSliceResult =
  | { status: "ok"; complete: boolean; deepened: number; rateLimited: boolean }
  | { status: "error"; complete: false; deepened: 0; error: string };

/**
 * Run one slice for a single athlete. Walks newest → oldest within the deep
 * window, fetching detail for up to SLICE_SIZE activities. Aborts the slice
 * early on a Strava 429 so the next cron pass picks up after the rolling
 * 15-min window resets.
 *
 * Returns `complete: true` only when a slice queries the activities table
 * and finds zero pending rows, which is the unambiguous "we're done" signal
 * regardless of whether processed_count matches the original target (the
 * target is a snapshot, the table is the source of truth).
 */
export async function runDeepBackfillSliceForAthlete(
  athleteId: string,
): Promise<DeepBackfillSliceResult> {
  const admin = createAdminClient();

  await admin
    .from("athletes")
    .update({
      deep_backfill_status: "running",
      deep_backfill_started_at: new Date().toISOString(),
    })
    .eq("id", athleteId);

  try {
    const { data: rows, error } = await admin
      .from("activities")
      .select("id")
      .eq("athlete_id", athleteId)
      .lt("start_date_local", foregroundBoundaryIso())
      .gte("start_date_local", deepFloorIso())
      .is("laps", null)
      .order("start_date_local", { ascending: false })
      .limit(SLICE_SIZE);
    if (error) throw error;

    const targets = (rows ?? []) as Array<{ id: string }>;
    if (targets.length === 0) {
      // Nothing pending: mark done.
      await admin
        .from("athletes")
        .update({
          deep_backfill_status: "done",
          deep_backfill_completed_at: new Date().toISOString(),
          deep_backfill_last_error: null,
        })
        .eq("id", athleteId);
      return { status: "ok", complete: true, deepened: 0, rateLimited: false };
    }

    let deepened = 0;
    let rateLimited = false;
    for (const t of targets) {
      const r = await ensureActivityLapDetail(t.id);
      if (r.ok) {
        deepened += 1;
        continue;
      }
      if (r.reason === "rate_limited") {
        // Abort the rest of the slice; next cron pass continues.
        rateLimited = true;
        break;
      }
      // Per-activity transient failure (network, Strava 5xx, etc.). Log and
      // skip; the row stays laps=null and the next slice will retry it.
      console.warn("deep backfill: activity fetch failed", t.id, r.reason);
    }

    // Always step back to "pending" after a slice so the cron query picks
    // the athlete up next pass. Slices end in three states: more rows remain
    // (need next pass), rate-limited (need next pass after the 15-min window
    // resets), and zero rows remain (caught by the targets.length === 0
    // branch above and marked "done"). "running" is in-flight only; using
    // it as a persisted post-slice state strands athletes outside the cron
    // selector.
    await admin
      .from("athletes")
      .update({
        deep_backfill_status: "pending",
        deep_backfill_processed_count: await readProcessedCount(athleteId, deepened),
        deep_backfill_last_error: null,
      })
      .eq("id", athleteId);

    return {
      status: "ok",
      complete: false,
      deepened,
      rateLimited,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "deep backfill failed";
    await admin
      .from("athletes")
      .update({
        deep_backfill_status: "error",
        deep_backfill_last_error: msg.slice(0, 500),
      })
      .eq("id", athleteId);
    return { status: "error", complete: false, deepened: 0, error: msg };
  }
}

async function readProcessedCount(
  athleteId: string,
  addend: number,
): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("athletes")
    .select("deep_backfill_processed_count")
    .eq("id", athleteId)
    .maybeSingle();
  const current =
    (data as { deep_backfill_processed_count: number | null } | null)
      ?.deep_backfill_processed_count ?? 0;
  return current + addend;
}

/**
 * One-time chat announcement when a deep backfill lands. Mirrors the shape
 * of `announceBackfillComplete` (post-history-backfill). Best-effort: a
 * post failure does not unwind the backfill itself.
 */
export async function announceDeepBackfillComplete(
  athleteId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: thread } = await admin
      .from("threads")
      .select("id")
      .eq("athlete_id", athleteId)
      .maybeSingle();
    if (!thread) return;

    // Don't double-post on cron re-fire.
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", thread.id)
      .eq("kind", "chat_casey")
      .contains("meta", { [DEEP_BACKFILL_ANNOUNCEMENT_META_KEY]: true });
    if ((count ?? 0) > 0) return;

    const { data: agg } = await admin
      .from("activities")
      .select("start_date_local")
      .eq("athlete_id", athleteId)
      .not("laps", "is", null)
      .order("start_date_local", { ascending: true })
      .limit(1);
    const oldest =
      agg && agg.length > 0 ? new Date(agg[0].start_date_local as string) : null;
    const horizon = oldest ? formatHorizon(oldest) : "your earlier history";

    const body =
      `Full detail is in. I now have laps, splits, and PRs across every run going back to ${horizon}, ` +
      `not just the recent twelve weeks. Anything you want me to read on a specific older run, just ask.`;

    await admin.from("messages").insert({
      thread_id: thread.id,
      athlete_id: athleteId,
      kind: "chat_casey",
      body,
      meta: { [DEEP_BACKFILL_ANNOUNCEMENT_META_KEY]: true },
    });
  } catch (e) {
    console.warn("deep backfill announcement failed (non-fatal)", e);
  }
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatHorizon(oldest: Date): string {
  return `${MONTHS[oldest.getMonth()]} ${oldest.getFullYear()}`;
}
