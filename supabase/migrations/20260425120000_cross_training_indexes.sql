-- Cross-training idempotency. Mirrors the debrief partial unique index — a
-- webhook retry, a duplicate Strava event, or a regen attempt must not
-- produce two cross-training messages for the same activity. Covers both
-- the standard ack and the substitution variant with a single index,
-- because an activity has exactly one message regardless of which variant
-- was chosen at generation time.

CREATE UNIQUE INDEX messages_cross_training_per_activity_uniq
  ON public.messages (athlete_id, (meta->>'activity_id'))
  WHERE kind IN ('cross_training_ack', 'cross_training_substitution')
    AND meta->>'activity_id' IS NOT NULL;
