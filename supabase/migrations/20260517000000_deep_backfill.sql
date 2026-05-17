-- Deep-backfill state on athletes.
--
-- The existing history backfill pulls activity *summaries* for the long
-- window (2 years by default, all-time on paid conversion) so Casey can
-- reason about volume, frequency, and shape over months/years. It deliberately
-- skips the per-activity detail endpoint to stay inside Strava's per-token
-- daily budget.
--
-- The *deep* backfill fills in the missing detail (laps, splits, best efforts)
-- on those summary rows. Triggered on paid conversion, paced gently across
-- many cron passes (5 activities per pass, hourly cron, ~6 days for a typical
-- 2-year history) so it doesn't crowd out the foreground 12-week ingest or
-- the chat refresh tool.
--
--   status:
--     'idle'   , no deep backfill needed yet (default for old rows + trials)
--     'pending', queued; cron will pick it up
--     'running', slice in progress
--     'done'   , every activity in the target window has laps
--     'error'  , last attempt errored; cron retries with backoff
--
--   target_count:
--     Total number of summary-only activities we'll deepen, snapshotted at
--     kickoff so progress percent reads cleanly even as new activities arrive
--     in the foreground window.
--
--   processed_count:
--     How many have been deep-fetched. Updated after each slice. Lets us show
--     "deepening your history, 412 of 638 runs so far" if we want a progress
--     surface later.

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS deep_backfill_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS deep_backfill_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS deep_backfill_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deep_backfill_last_error text,
  ADD COLUMN IF NOT EXISTS deep_backfill_target_count integer,
  ADD COLUMN IF NOT EXISTS deep_backfill_processed_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.athletes
  DROP CONSTRAINT IF EXISTS athletes_deep_backfill_status_check;

ALTER TABLE public.athletes
  ADD CONSTRAINT athletes_deep_backfill_status_check
  CHECK (deep_backfill_status IN ('idle', 'pending', 'running', 'done', 'error'));

CREATE INDEX IF NOT EXISTS athletes_deep_backfill_status_idx
  ON public.athletes(deep_backfill_status)
  WHERE deep_backfill_status IN ('pending', 'running', 'error');

COMMENT ON COLUMN public.athletes.deep_backfill_status IS
  'State of the post-paid deep backfill: idle | pending | running | done | error.';
COMMENT ON COLUMN public.athletes.deep_backfill_target_count IS
  'Number of summary-only activities queued for deepening at kickoff.';
COMMENT ON COLUMN public.athletes.deep_backfill_processed_count IS
  'How many activities have been deepened so far. Resets to 0 on each kickoff.';
