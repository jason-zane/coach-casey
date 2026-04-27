"use server";

import { kickOffHistoryBackfill } from "@/lib/strava/backfill";
import { requireAthlete } from "@/app/actions/onboarding";

/**
 * Hooks fired when a trial converts to a paid subscription. Currently a
 * single side-effect — upgrade the long-history Strava backfill from the
 * two-year window the athlete got at onboarding to all-time. Earned by
 * commitment and gives Casey the deepest possible picture of who the
 * athlete is.
 *
 * Wiring is deferred until the paywall flow lands: the trials table is
 * already in place, but there's no conversion event yet. Once Stripe (or
 * whichever provider) wires up, call this from the webhook/server action
 * that flips the athlete from trial to paid.
 *
 * Idempotent — `kickOffHistoryBackfill` no-ops if the all-time backfill
 * has already completed, so calling on every renewal is safe.
 */
export async function onPaidSubscriptionStarted(): Promise<void> {
  const { athlete } = await requireAthlete();
  await kickOffHistoryBackfill(athlete.id, "all_time");
}
