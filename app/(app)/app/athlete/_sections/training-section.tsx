import {
  formatDistance,
  loadAthleteProfile,
  loadWeeklyTraining,
} from "@/lib/athlete/page-data";

/**
 * Lead paragraph for the "Your training" section. One sentence of
 * weekly mileage prose. Loads its own profile snapshot for units +
 * timezone, but loadAthleteProfile is React-cache-memoised against
 * the You section's call so this is a free lookup, not a duplicate
 * query. Returns null when there are no runs yet, the page handles
 * the empty state by hiding the whole training section.
 */
export async function TrainingSection({ athleteId }: { athleteId: string }) {
  const profile = await loadAthleteProfile(athleteId);
  const weekly = await loadWeeklyTraining(athleteId, profile.timezone);
  if (!weekly.hasAnyRuns) return null;
  return (
    <p className="text-[14px] leading-[1.6] text-ink">
      You&rsquo;re averaging{" "}
      <span className="font-medium">
        {formatDistance(weekly.fourWeekAvgRunMetres, profile.units)}
      </span>{" "}
      a week over the last four weeks.{" "}
      {weekly.thisWeekRunMetres > 0 ? (
        <>
          This week so far:{" "}
          <span className="font-medium">
            {formatDistance(weekly.thisWeekRunMetres, profile.units)}
          </span>
          .
        </>
      ) : (
        <>Nothing logged this week yet.</>
      )}
    </p>
  );
}
