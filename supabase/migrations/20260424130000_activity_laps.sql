-- Store lap-level data alongside the activity summary so Coach Casey can
-- actually identify workouts (interval reps, tempo splits, progression runs).
-- The summary-only fetch doesn't expose per-lap pace / HR variation, which
-- is the main signal for distinguishing "workout" from "steady run".

ALTER TABLE public.activities ADD COLUMN laps jsonb;
