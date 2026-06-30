-- =====================================================================
-- Strava verdict line: per-activity tracking
-- =====================================================================
--
-- Casey's one-line verdict was previously a side effect of the run
-- debrief flow, so only runs that cleared the debrief gate ever got a
-- line on their Strava description. It is now a first-class per-activity
-- step (lib/server/strava-line.ts) that fires for every activity class
-- (runs, rides, swims, gym, walks, ...) from both the webhook and the
-- safety-net cron.
--
-- This column is the idempotency marker. It is set once the line has
-- been RESOLVED for an activity, which means either: the line was
-- written, the description already read as we'd write it, or the athlete
-- edited around our block so we deliberately backed off. A hard write
-- failure (Strava 5xx, rate limit) leaves it NULL so the cron retries.
-- The marker is what stops the 30-minute poll from regenerating a line
-- (and paying for the model call) on every sweep.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS strava_line_written_at timestamptz;

-- Cron sweep load path: "recent activities still missing a line". Partial
-- index over only the un-written rows, which is the set the poll scans.
CREATE INDEX IF NOT EXISTS activities_strava_line_pending_idx
  ON public.activities (start_date_local)
  WHERE strava_line_written_at IS NULL;
