-- Grade-adjusted pace storage for runs. Strava's summary endpoint doesn't
-- carry GAP — it has to be computed from the activity stream
-- (grade_adjusted_distance ÷ moving_time). We fetch streams behind a flag
-- per `docs/training-load-feature-spec.md` §4.1; this column is where the
-- result lives.
--
-- Nullable; flat / GPS-less / pre-flag activities will read null and the
-- load calculator falls back to raw pace.

ALTER TABLE public.activities
  ADD COLUMN gap_s_per_km numeric;

COMMENT ON COLUMN public.activities.gap_s_per_km IS
  'Grade-adjusted average pace in s/km, derived from the Strava grade_adjusted_distance stream. Null when streams were not fetched or unavailable.';
