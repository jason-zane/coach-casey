import {
  loadMemoryProgress,
  loadStravaConnection,
  loadTrackingItems,
} from "@/lib/athlete/page-data";
import { buildMemoryHeroLine } from "@/lib/athlete/memory-hero";

/**
 * The moat in one line. Renders the relational snapshot at the top of
 * the athlete page: how long Casey has been with you, what's been
 * read, what's still on the radar. Streamed via Suspense from the
 * page so the H1 lands instantly and this fills in.
 */
export async function HeroMemoryLine({
  athleteId,
  joinedAt,
}: {
  athleteId: string;
  joinedAt: string;
}) {
  const [progress, tracking, strava] = await Promise.all([
    loadMemoryProgress(athleteId),
    loadTrackingItems(athleteId),
    loadStravaConnection(athleteId),
  ]);
  const line = buildMemoryHeroLine({
    joinedAt,
    runs: progress.runs,
    messages: progress.caseyMessages,
    niggles: tracking.niggles.length,
    stravaConnected: strava.isConnected,
  });
  return (
    <p className="text-[14px] leading-[1.6] text-ink tabular-nums">{line}</p>
  );
}
