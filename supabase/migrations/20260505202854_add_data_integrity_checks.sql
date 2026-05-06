-- Add low-risk integrity checks now that the MVP tables have settled.
--
-- Constraints are added NOT VALID so existing bad historical rows, if any,
-- do not block deployment. Postgres still enforces each check for new rows
-- and for future updates; we can validate them later after inspecting prod
-- data.

ALTER TABLE public.athletes
  DROP CONSTRAINT IF EXISTS athletes_sex_check;
ALTER TABLE public.athletes
  ADD CONSTRAINT athletes_sex_check
  CHECK (sex IS NULL OR sex IN ('M', 'F', 'X')) NOT VALID;

ALTER TABLE public.athletes
  DROP CONSTRAINT IF EXISTS athletes_weight_kg_check;
ALTER TABLE public.athletes
  ADD CONSTRAINT athletes_weight_kg_check
  CHECK (weight_kg IS NULL OR (weight_kg > 20 AND weight_kg < 250)) NOT VALID;

ALTER TABLE public.athletes
  DROP CONSTRAINT IF EXISTS athletes_onboarding_current_step_check;
ALTER TABLE public.athletes
  ADD CONSTRAINT athletes_onboarding_current_step_check
  CHECK (
    onboarding_current_step IN (
      'strava',
      'about-you',
      'validation',
      'plan',
      'install',
      'notifications',
      'goal-race',
      'injury'
    )
  ) NOT VALID;

ALTER TABLE public.memory_items
  DROP CONSTRAINT IF EXISTS memory_items_kind_check;
ALTER TABLE public.memory_items
  ADD CONSTRAINT memory_items_kind_check
  CHECK (kind IN ('injury', 'context')) NOT VALID;

ALTER TABLE public.training_plans
  DROP CONSTRAINT IF EXISTS training_plans_source_check;
ALTER TABLE public.training_plans
  ADD CONSTRAINT training_plans_source_check
  CHECK (source IN ('text')) NOT VALID;

ALTER TABLE public.preferences
  DROP CONSTRAINT IF EXISTS preferences_plan_follower_status_check;
ALTER TABLE public.preferences
  ADD CONSTRAINT preferences_plan_follower_status_check
  CHECK (plan_follower_status IN ('unknown', 'following', 'deferred', 'none')) NOT VALID;

ALTER TABLE public.preferences
  DROP CONSTRAINT IF EXISTS preferences_weekly_review_day_check;
ALTER TABLE public.preferences
  ADD CONSTRAINT preferences_weekly_review_day_check
  CHECK (weekly_review_day BETWEEN 0 AND 6) NOT VALID;

ALTER TABLE public.goal_races
  DROP CONSTRAINT IF EXISTS goal_races_goal_time_seconds_check;
ALTER TABLE public.goal_races
  ADD CONSTRAINT goal_races_goal_time_seconds_check
  CHECK (goal_time_seconds IS NULL OR (goal_time_seconds > 0 AND goal_time_seconds <= 86400)) NOT VALID;

ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_distance_m_check;
ALTER TABLE public.activities
  ADD CONSTRAINT activities_distance_m_check
  CHECK (distance_m IS NULL OR distance_m >= 0) NOT VALID;

ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_moving_time_s_check;
ALTER TABLE public.activities
  ADD CONSTRAINT activities_moving_time_s_check
  CHECK (moving_time_s IS NULL OR moving_time_s >= 0) NOT VALID;

CREATE INDEX IF NOT EXISTS messages_athlete_live_idx
  ON public.messages(athlete_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS activity_notes_athlete_idx
  ON public.activity_notes(athlete_id);

DROP POLICY IF EXISTS "messages read own" ON public.messages;
CREATE POLICY "messages read own" ON public.messages
  FOR SELECT USING (
    deleted_at IS NULL
    AND athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );
