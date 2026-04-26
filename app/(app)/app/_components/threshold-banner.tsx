import { confirmRaceSnapshot, rejectRaceSnapshot } from "@/app/actions/race";
import {
  getCurrentSnapshot,
  getPendingReviewSnapshot,
} from "@/lib/training-load/snapshots";

const STALE_THRESHOLD_DAYS = 90;

/**
 * Threshold banner per `docs/training-load-feature-spec.md` §11.
 * Two soft prompts in priority order:
 *
 *   1. Pending-review snapshot — a race produced a >1-VDOT-lower result
 *      and was flagged. The athlete confirms or rejects.
 *   2. Stale high-confidence snapshot — the athlete's most recent
 *      race-derived snapshot is >90 days old. Suggests entering a
 *      recent race time.
 *
 * Voice-aligned final copy is launch-prep work; this is the placeholder
 * that proves the data path. Server component so the banner is part of
 * the initial paint, not a client-side roundtrip.
 */

function daysBetween(iso: string, now: Date): number {
  const dt = new Date(iso);
  return Math.floor((now.getTime() - dt.getTime()) / (24 * 60 * 60 * 1000));
}

export async function ThresholdBanner({ athleteId }: { athleteId: string }) {
  const [pending, current] = await Promise.all([
    getPendingReviewSnapshot(athleteId).catch(() => null),
    getCurrentSnapshot(athleteId).catch(() => null),
  ]);

  if (pending) {
    return (
      <aside
        role="status"
        aria-label="Threshold review needed"
        className="border-b border-rule bg-surface px-4 py-3"
      >
        <div className="mx-auto max-w-2xl space-y-2">
          <p className="font-sans text-sm text-ink">
            One of your recent races came in below where I had your
            threshold. Sometimes that&rsquo;s a real shift; sometimes it&rsquo;s
            a bad day. Want me to take this race as the new reference?
          </p>
          <div className="flex gap-2">
            <form action={confirmRaceSnapshot}>
              <input type="hidden" name="snapshot_id" value={pending.id} />
              <button
                type="submit"
                className="rounded-md bg-accent px-4 py-2 font-sans text-sm text-accent-ink transition-opacity hover:opacity-90"
              >
                Use it
              </button>
            </form>
            <form action={rejectRaceSnapshot}>
              <input type="hidden" name="snapshot_id" value={pending.id} />
              <button
                type="submit"
                className="rounded-md border border-rule bg-surface px-4 py-2 font-sans text-sm text-ink-muted transition-colors hover:border-accent"
              >
                Skip — bad day
              </button>
            </form>
          </div>
        </div>
      </aside>
    );
  }

  if (
    current &&
    current.confidence === "high" &&
    daysBetween(current.snapshotDate, new Date()) > STALE_THRESHOLD_DAYS
  ) {
    return (
      <aside
        role="status"
        aria-label="Threshold may be stale"
        className="border-b border-rule bg-surface px-4 py-3"
      >
        <p className="mx-auto max-w-2xl font-sans text-sm text-ink-muted">
          Your last race result was a while ago. If you&rsquo;ve raced
          recently, drop the time in settings and I&rsquo;ll resharpen
          your reference paces.
        </p>
      </aside>
    );
  }

  return null;
}
