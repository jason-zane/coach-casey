-- Debrief idempotency. A webhook retry, a duplicate Strava event, or a
-- manual regeneration attempt should not produce two debrief messages for
-- the same activity.
--
-- Enforced as a partial unique index on messages with kind='debrief' and
-- meta.activity_id present. Debriefs without an activity_id (unlikely, but
-- valid) are unconstrained. Other message kinds are unconstrained.

CREATE UNIQUE INDEX messages_debrief_per_activity_uniq
  ON public.messages (athlete_id, (meta->>'activity_id'))
  WHERE kind = 'debrief' AND meta->>'activity_id' IS NOT NULL;

-- Activity lookup by strava_id for the webhook path. The webhook event
-- arrives with { owner_id (strava_athlete_id), object_id (strava activity
-- id) }; resolving the activity row is a per-event hot path.
-- Already covered by the UNIQUE (athlete_id, strava_id) constraint, no
-- separate index needed.

-- Athlete lookup by strava_athlete_id, the webhook's first resolution
-- step (owner_id → athlete_id). Without this index the webhook scans
-- strava_connections on every event.
CREATE INDEX IF NOT EXISTS strava_connections_strava_athlete_id_idx
  ON public.strava_connections(strava_athlete_id)
  WHERE strava_athlete_id IS NOT NULL;
