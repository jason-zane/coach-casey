import { createAdminClient } from "@/lib/supabase/server";
import { fetchActivitiesWindow } from "./client";
import { classifyActivityType } from "./activity-types";
import { mapStravaActivity } from "./ingest";

/**
 * Long-history Strava backfill. Distinct from the foreground ingest in
 * `ingest.ts` — that one pulls 12 weeks with full lap detail during onboarding
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

function recentBoundarySeconds(): number {
  const d = new Date();
  d.setDate(d.getDate() - RECENT_WINDOW_WEEKS * 7);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Mark an athlete for a long-history backfill. Idempotent — calling twice
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
      history_backfill_started_at: null,
      history_backfill_completed_at: null,
      history_backfill_last_error: null,
    })
    .eq("id", athleteId);
}

/**
 * Run one slice of the backfill for a single athlete. Idempotent — the
 * upsert on (athlete_id, strava_id) prevents duplicates, and the before-
 * boundary keeps it from overlapping the foreground ingest window.
 *
 * Returns the number of rows upserted.
 */
export async function runHistoryBackfillForAthlete(
  athleteId: string,
): Promise<{ status: "done" | "error"; rowsUpserted: number; error?: string }> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("athletes")
    .select("history_backfill_floor_iso")
    .eq("id", athleteId)
    .maybeSingle();
  if (!row) return { status: "error", rowsUpserted: 0, error: "no athlete" };
  const floorIso = (row as { history_backfill_floor_iso: string | null })
    .history_backfill_floor_iso;

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
    const beforeSeconds = recentBoundarySeconds();

    const activities = await fetchActivitiesWindow(athleteId, {
      afterSeconds,
      beforeSeconds,
      // 30 pages × 100 = 3000 activities. Two years of dedicated
      // marathoner training tops out around 700; this covers it
      // comfortably. All-time backfills for very long-tenured athletes
      // may exceed this — the cron will simply re-fire on the next pass
      // since the resulting upsert is idempotent.
      maxPages: 30,
    });

    // Drop ambient types (Walk, etc.) — same filter the foreground ingest
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

    await admin
      .from("athletes")
      .update({
        history_backfill_status: "done",
        history_backfill_completed_at: new Date().toISOString(),
        history_backfill_last_error: null,
      })
      .eq("id", athleteId);

    return { status: "done", rowsUpserted: kept.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Backfill failed.";
    await admin
      .from("athletes")
      .update({
        history_backfill_status: "error",
        history_backfill_last_error: msg.slice(0, 500),
      })
      .eq("id", athleteId);
    return { status: "error", rowsUpserted: 0, error: msg };
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
    // thread doesn't exist — the announcement will land naturally as part
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
    const oldest = agg && agg.length > 0 ? new Date(agg[0].start_date_local as string) : null;
    const monthsBack = oldest
      ? Math.max(1, Math.round((Date.now() - oldest.getTime()) / (30.44 * 24 * 60 * 60 * 1000)))
      : null;

    const horizon = monthsBack
      ? monthsBack >= 22
        ? "the last two years"
        : monthsBack >= 12
          ? `the last ${Math.round(monthsBack / 12 * 10) / 10} years`
          : `the last ${monthsBack} months`
      : "your history";

    const body =
      `I&rsquo;ve now read ${horizon} of your training. ` +
      `That gives me a fuller picture — peaks, blocks, gaps, the shape of how you build.`;

    await admin.from("messages").insert({
      thread_id: thread.id,
      athlete_id: athleteId,
      kind: "chat_casey",
      body: body.replace(/&rsquo;/g, "’"),
      meta: { backfill: true },
    });
  } catch (e) {
    console.warn("backfill announcement failed (non-fatal)", e);
  }
}
