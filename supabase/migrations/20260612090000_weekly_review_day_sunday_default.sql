-- Weekly review moves to Sunday evening (athlete-local) as the default
-- send slot. preferences.weekly_review_day, present since the onboarding
-- schema but read by nothing until now, becomes the cron's per-athlete
-- day switch:
--
--   0 (default) = Sunday evening, 18:00-20:59 local, reviewing the week
--                 that closes that day (Monday through Sunday).
--   1           = Monday morning, 07:00-10:59 local, reviewing the week
--                 that ended the day before. For athletes who prefer the
--                 review with Monday coffee.
--
-- Both cover the same calendar week and share the same idempotency key
-- (the week's Monday), so flipping the preference can neither double-send
-- nor skip a week.
--
-- The old check allowed 0-6; only Sunday and Monday sends are supported,
-- so tighten to the two values the cron honours. NOT VALID matches the
-- existing constraint pattern: every row written so far carries the
-- column default 0, nothing needs re-validating.

ALTER TABLE public.preferences
  DROP CONSTRAINT IF EXISTS preferences_weekly_review_day_check;
ALTER TABLE public.preferences
  ADD CONSTRAINT preferences_weekly_review_day_check
  CHECK (weekly_review_day IN (0, 1)) NOT VALID;

COMMENT ON COLUMN public.preferences.weekly_review_day IS
  'Weekly review send day, athlete-local. 0 = Sunday evening (default), 1 = Monday morning. Read by /api/cron/weekly-review.';
