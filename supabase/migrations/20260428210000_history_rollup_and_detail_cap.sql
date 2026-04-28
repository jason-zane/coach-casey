-- Long-history rollup + per-athlete detail fetch cap.
--
-- Two separate concerns landed in the same migration because both hang off
-- the same product change (give Casey honest access to deeper history):
--
-- 1. monthly_history_rollup: a cached per-month rollup of activities older
--    than the 12-week foreground window. Computed once when the long-history
--    backfill lands, refreshed if the backfill is later upgraded (e.g. to
--    all_time). Lets the chat prompt show shape-of-history cheaply without
--    re-aggregating on every turn.
--
-- 2. detail_fetches_today / detail_fetches_day: a per-athlete daily counter
--    for on-demand Strava detail fetches Casey can do during chat (lap
--    structure for older runs). Capped to keep us inside Strava's
--    100-reads-per-15-min budget when a curious athlete drills into a lot of
--    historical runs in one session.
--
-- Both default cleanly: NULL rollup = no long history yet, today counter
-- resets when detail_fetches_day rolls over.

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS monthly_history_rollup jsonb,
  ADD COLUMN IF NOT EXISTS monthly_history_rollup_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS detail_fetches_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detail_fetches_day date;

COMMENT ON COLUMN public.athletes.monthly_history_rollup IS
  'Per-month rollup of activities older than the 12-week foreground window. Array of {month, distance_km, run_count, longest_km, races} objects ordered oldest to newest. NULL until the long-history backfill lands.';
COMMENT ON COLUMN public.athletes.monthly_history_rollup_updated_at IS
  'When the rollup was last computed. Used to invalidate when the backfill floor moves (e.g. two_years to all_time upgrade).';
COMMENT ON COLUMN public.athletes.detail_fetches_today IS
  'Counter for on-demand Strava detail fetches Casey has done for this athlete today. Resets at midnight (athlete-local).';
COMMENT ON COLUMN public.athletes.detail_fetches_day IS
  'The date the detail_fetches_today counter applies to. NULL or older than today means the counter is stale and treated as 0.';
