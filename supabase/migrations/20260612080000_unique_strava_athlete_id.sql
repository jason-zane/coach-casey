-- One Strava account backs at most one app account.
--
-- strava_athlete_id had no uniqueness guarantee, so two app accounts
-- completing OAuth with the same Strava account left two connection rows
-- sharing one strava_athlete_id. The webhook handler resolves the athlete
-- with .maybeSingle() on that column, which errors on multiple rows, so
-- every event for that Strava account was silently dropped for both
-- athletes.
--
-- Policy is last-connect-wins, the same end state Strava's deauth webhook
-- produces (it deletes connections by strava_athlete_id): the most recent
-- OAuth grant owns the Strava account and any older claim is removed. The
-- OAuth callback and the ingest self-heal enforce this in code; the index
-- below backstops races.

-- Dedupe before indexing: keep the newest connection per strava_athlete_id
-- (ties broken on athlete_id so exactly one row survives). Production has
-- no non-NULL duplicates today; dev databases might.
DELETE FROM public.strava_connections older
USING public.strava_connections newer
WHERE older.strava_athlete_id IS NOT NULL
  AND newer.strava_athlete_id = older.strava_athlete_id
  AND newer.athlete_id <> older.athlete_id
  AND (
    newer.connected_at > older.connected_at
    OR (
      newer.connected_at = older.connected_at
      AND newer.athlete_id > older.athlete_id
    )
  );

-- Partial: rows with NULL strava_athlete_id stay allowed. Mock and dev
-- connects start with NULL, and live connects can land with NULL when the
-- token exchange omits the athlete id (the ingest self-heal fills it in).
CREATE UNIQUE INDEX strava_connections_strava_athlete_id_uniq
  ON public.strava_connections(strava_athlete_id)
  WHERE strava_athlete_id IS NOT NULL;
