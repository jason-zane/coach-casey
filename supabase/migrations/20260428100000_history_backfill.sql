-- History backfill state on athletes.
--
-- Two-year (and later, all-time) Strava activity backfill. Onboarding's
-- foreground ingest only pulls 12 weeks with full lap detail, fast, but
-- leaves Casey blind to the athlete's deeper training history. This column
-- set tracks an asynchronous backfill that pulls activity *summaries* (no
-- laps) for a longer window so Casey can reason about volume, frequency,
-- and patterns over months/years without burning Strava's per-run detail
-- budget.
--
--   status:
--     'idle'   , no backfill needed yet (default for old rows)
--     'pending', queued; cron will pick it up
--     'running', slice in progress
--     'done'   , completed, oldest activity at floor
--     'error'  , last attempt errored; cron retries with backoff
--
--   floor_iso:
--     time floor for the backfill. Two-year backfills set this to
--     now − 2y at trigger time; all-time backfills set it to NULL.
--
--   last_error:
--     short error message from the last failed slice. Cleared on success.

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS history_backfill_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS history_backfill_floor_iso timestamptz,
  -- Upper bound (exclusive) for the next fetch. Anchored at kickoff to
  -- (onboarding completion time − 12 weeks) so it does NOT drift forward
  -- on subsequent cron passes, preventing summary upserts from
  -- overwriting lap detail the foreground ingest already pulled. Updates
  -- on each cron pass when the page cap is hit, walking backwards
  -- through history one chunk at a time.
  ADD COLUMN IF NOT EXISTS history_backfill_before_iso timestamptz,
  ADD COLUMN IF NOT EXISTS history_backfill_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS history_backfill_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS history_backfill_last_error text;

ALTER TABLE public.athletes
  DROP CONSTRAINT IF EXISTS athletes_history_backfill_status_check;

ALTER TABLE public.athletes
  ADD CONSTRAINT athletes_history_backfill_status_check
  CHECK (history_backfill_status IN ('idle', 'pending', 'running', 'done', 'error'));

CREATE INDEX IF NOT EXISTS athletes_history_backfill_status_idx
  ON public.athletes(history_backfill_status)
  WHERE history_backfill_status IN ('pending', 'running', 'error');

COMMENT ON COLUMN public.athletes.history_backfill_status IS
  'State of the long-history Strava backfill: idle | pending | running | done | error.';
COMMENT ON COLUMN public.athletes.history_backfill_floor_iso IS
  'Earliest activity timestamp the current backfill should pull. NULL means all-time.';
COMMENT ON COLUMN public.athletes.history_backfill_before_iso IS
  'Exclusive upper bound for the next fetch slice. Anchored at kickoff and walks backwards as cron paginates older history. NULL once backfill is done.';
