/**
 * Strava connection claims, last-connect-wins.
 *
 * A Strava account backs at most one Coach Casey account at a time,
 * enforced by the partial unique index
 * `strava_connections_strava_athlete_id_uniq`. Before that index existed,
 * two app accounts completing OAuth with the same Strava account left two
 * rows sharing a strava_athlete_id; the webhook handler's .maybeSingle()
 * lookup then errored and events were silently dropped for both athletes.
 *
 * When a new grant arrives for a Strava account another app account
 * already holds, the newest grant wins and the older connection row is
 * deleted, the same end state Strava's deauth webhook produces (it deletes
 * connections by strava_athlete_id). The displaced athlete keeps their
 * ingested history, matching disconnectStrava().
 */

type DeleteResult = PromiseLike<{
  data: { athlete_id: string }[] | null;
  error: { message: string } | null;
}>;

/**
 * The slice of the Supabase admin client this module touches. Narrow on
 * purpose so tests can drive the logic with a hand-rolled fake instead of
 * a live client.
 */
export type StravaConnectionsAdmin = {
  from(table: "strava_connections"): {
    delete(): {
      eq(
        column: "strava_athlete_id",
        value: number,
      ): {
        neq(
          column: "athlete_id",
          value: string,
        ): {
          select(columns: "athlete_id"): DeleteResult;
        };
      };
    };
  };
};

/**
 * Release any other athlete's claim on `stravaAthleteId` so the caller can
 * write it to `athleteId`'s connection row without tripping the unique
 * index. Returns the displaced athlete ids (normally empty). No-op when
 * the id is unknown; NULL rows sit outside the index and self-heal later.
 */
export async function claimStravaAthleteId(
  admin: StravaConnectionsAdmin,
  params: { athleteId: string; stravaAthleteId: number | null | undefined },
): Promise<string[]> {
  const { athleteId, stravaAthleteId } = params;
  if (stravaAthleteId == null) return [];

  const { data, error } = await admin
    .from("strava_connections")
    .delete()
    .eq("strava_athlete_id", stravaAthleteId)
    .neq("athlete_id", athleteId)
    .select("athlete_id");
  if (error) throw error;

  const displaced = (data ?? []).map((row) => row.athlete_id);
  if (displaced.length > 0) {
    // Loud: an existing connection just lost its Strava account to a new
    // grant. Expected when one human re-connects under a fresh app account,
    // suspicious if it shows up for an athlete who didn't just sign in.
    console.warn("[strava-connections] last-connect-wins displaced connection(s)", {
      stravaAthleteId,
      claimedBy: athleteId,
      displaced,
    });
  }
  return displaced;
}
