"use server";

import { kickOffHistoryBackfill } from "@/lib/strava/backfill";
import { kickOffDeepBackfill } from "@/lib/strava/deep-backfill";
import { requireAthlete } from "@/app/actions/onboarding";

/**
 * Hooks fired when a trial converts to a paid subscription. Two side effects:
 *
 *   1. Upgrade the long-history summary backfill from the two-year window the
 *      athlete got at onboarding to all-time, gives Casey the deepest possible
 *      summary picture.
 *   2. Kick off the deep backfill, fills in laps / splits / best_efforts on
 *      the existing summary rows so Casey has full structure on every run in
 *      the 2-year window, not just the recent 12 weeks. Paced gently across
 *      ~6 days of hourly cron passes.
 *
 * Wiring is deferred until the paywall flow lands: the trials table is
 * already in place, but there's no conversion event yet. Once Stripe (or
 * whichever provider) wires up, call this from the webhook/server action
 * that flips the athlete from trial to paid.
 *
 * Idempotent on both fronts: `kickOffHistoryBackfill` no-ops if the all-time
 * backfill has already completed, and `kickOffDeepBackfill` no-ops if there
 * are no remaining summary-only rows to deepen.
 */
export async function onPaidSubscriptionStarted(): Promise<void> {
  const { athlete } = await requireAthlete();
  await kickOffHistoryBackfill(athlete.id, "all_time");
  await kickOffDeepBackfill(athlete.id);
}
