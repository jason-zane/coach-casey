import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { calculateAndPersistLoadForActivity } from "./calculator";

/**
 * Recalculate load for every activity in a date window. Triggered by the
 * snapshot-append path when the threshold pace changes (spec §4.5).
 *
 * Async, fire-and-forget by convention — the caller schedules but does
 * not await. Errors surface via Sentry on the calculator's throw paths.
 *
 * Bounded concurrency: single-threaded today. The volume per athlete is
 * small (≤ ~500 activities/year and the window is usually months not
 * years) and Supabase row limits are generous. If recalc latency
 * becomes a concern at scale, switch to bounded parallelism here.
 */
export async function recalculateLoadInWindow(
  athleteId: string,
  fromIsoDate: string,
  toIsoDate?: string,
): Promise<{ recalculated: number; errors: number }> {
  const admin = createAdminClient();
  const upper = toIsoDate ?? new Date().toISOString();

  const { data, error } = await admin
    .from("activities")
    .select("id")
    .eq("athlete_id", athleteId)
    .gte("start_date_local", fromIsoDate)
    .lte("start_date_local", upper)
    .order("start_date_local", { ascending: true });
  if (error) throw error;

  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  let recalculated = 0;
  let errors = 0;
  for (const id of ids) {
    try {
      await calculateAndPersistLoadForActivity(athleteId, id);
      recalculated += 1;
    } catch (e) {
      errors += 1;
      console.error("training_load.recalc.failed", {
        athleteId,
        activityId: id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  console.log(
    JSON.stringify({
      event: "training_load.recalc.complete",
      athleteId,
      fromIsoDate,
      toIsoDate: upper,
      recalculated,
      errors,
    }),
  );
  return { recalculated, errors };
}

/**
 * Schedule recalculation without blocking the caller. Errors are caught
 * and logged — never propagated, since the recalc is a side-effect of
 * the snapshot write rather than part of its critical path.
 *
 * In serverless contexts the caller should pair this with `after()` so
 * the work isn't cut off by the response. Standalone here because the
 * snapshot write paths run from server actions / webhooks that already
 * sit in `after()` blocks of their own.
 */
export function scheduleRecalculation(
  athleteId: string,
  fromIsoDate: string,
  toIsoDate?: string,
): void {
  // Intentionally not awaited.
  void recalculateLoadInWindow(athleteId, fromIsoDate, toIsoDate).catch((e) => {
    console.error("training_load.recalc.unhandled", {
      athleteId,
      fromIsoDate,
      toIsoDate,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}
