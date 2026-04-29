-- Activity ingest expansion. Surface fields previously buried inside the raw
-- JSONB blob as their own columns so the chat tool layer can read them
-- without needing to know Strava's response shape, and so the tool returns
-- (lookup_activity in particular) stay cheap and predictable token-wise.
--
-- Three groups of additions:
--
-- 1. Scalar fields available on every activity, summary or detail (timezone,
--    elapsed_time, location, watts, cadence, speed, suffer_score, temp,
--    elevation high/low, manual/trainer/commute flags, description). Backfilled
--    in this migration from the existing raw blob.
--
-- 2. Structured fields only present when we fetch the detail endpoint (laps
--    are already a column from a prior migration; splits_metric,
--    splits_standard, best_efforts, segment_efforts are added here as JSONB).
--    Backfilled from raw where present; will be NULL for rows whose ingest
--    used the list endpoint only (older backfill rows, foreground non-run
--    rows under the previous policy where detail was runs-only).
--
-- 3. Indexes for the few new fields the chat-tool query path actually filters
--    on. Most new columns are scalar reads-on-already-indexed-rows so they
--    don't need their own index.
--
-- Going forward the ingest mapper writes these directly, so steady-state new
-- activities arrive with everything populated. Older rows fill in opportunistically
-- as Casey refreshes them via the new refresh_activity_from_strava tool.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS elapsed_time_s integer,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS utc_offset numeric,
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS avg_watts numeric,
  ADD COLUMN IF NOT EXISTS max_watts integer,
  ADD COLUMN IF NOT EXISTS weighted_avg_watts numeric,
  ADD COLUMN IF NOT EXISTS kilojoules numeric,
  ADD COLUMN IF NOT EXISTS device_watts boolean,
  ADD COLUMN IF NOT EXISTS avg_cadence numeric,
  ADD COLUMN IF NOT EXISTS avg_speed_m_s numeric,
  ADD COLUMN IF NOT EXISTS max_speed_m_s numeric,
  ADD COLUMN IF NOT EXISTS suffer_score numeric,
  ADD COLUMN IF NOT EXISTS avg_temp_c numeric,
  ADD COLUMN IF NOT EXISTS elev_high_m numeric,
  ADD COLUMN IF NOT EXISTS elev_low_m numeric,
  ADD COLUMN IF NOT EXISTS is_manual boolean,
  ADD COLUMN IF NOT EXISTS is_trainer boolean,
  ADD COLUMN IF NOT EXISTS is_commute boolean,
  ADD COLUMN IF NOT EXISTS splits_metric jsonb,
  ADD COLUMN IF NOT EXISTS splits_standard jsonb,
  ADD COLUMN IF NOT EXISTS best_efforts jsonb,
  ADD COLUMN IF NOT EXISTS segment_efforts jsonb;

-- Backfill from existing raw blobs. Defensive casts: jsonb ->> returns text;
-- numeric/integer casts on a missing key produce NULL through the ->> path
-- so this is safe on rows that don't carry the field.
UPDATE public.activities
SET
  elapsed_time_s        = NULLIF(raw->>'elapsed_time', '')::integer,
  timezone              = raw->>'timezone',
  utc_offset            = NULLIF(raw->>'utc_offset', '')::numeric,
  location_city         = NULLIF(raw->>'location_city', ''),
  description           = NULLIF(raw->>'description', ''),
  avg_watts             = NULLIF(raw->>'average_watts', '')::numeric,
  max_watts             = NULLIF(raw->>'max_watts', '')::integer,
  weighted_avg_watts    = NULLIF(raw->>'weighted_average_watts', '')::numeric,
  kilojoules            = NULLIF(raw->>'kilojoules', '')::numeric,
  device_watts          = NULLIF(raw->>'device_watts', '')::boolean,
  avg_cadence           = NULLIF(raw->>'average_cadence', '')::numeric,
  avg_speed_m_s         = NULLIF(raw->>'average_speed', '')::numeric,
  max_speed_m_s         = NULLIF(raw->>'max_speed', '')::numeric,
  suffer_score          = NULLIF(raw->>'suffer_score', '')::numeric,
  avg_temp_c            = NULLIF(raw->>'average_temp', '')::numeric,
  elev_high_m           = NULLIF(raw->>'elev_high', '')::numeric,
  elev_low_m            = NULLIF(raw->>'elev_low', '')::numeric,
  is_manual             = NULLIF(raw->>'manual', '')::boolean,
  is_trainer            = NULLIF(raw->>'trainer', '')::boolean,
  is_commute            = NULLIF(raw->>'commute', '')::boolean,
  splits_metric         = raw->'splits_metric',
  splits_standard       = raw->'splits_standard',
  best_efforts          = raw->'best_efforts',
  segment_efforts       = raw->'segment_efforts'
WHERE raw IS NOT NULL;

-- Index the manual flag so the debrief gate / tool layer can cheaply skip
-- manually-entered activities (no GPS, no HR, no signal worth interpreting).
CREATE INDEX IF NOT EXISTS activities_athlete_not_manual_idx
  ON public.activities(athlete_id, start_date_local DESC)
  WHERE is_manual IS NOT TRUE;

COMMENT ON COLUMN public.activities.elapsed_time_s IS
  'Total elapsed time in seconds (includes pauses). moving_time_s already covers active time; elapsed is for "you stopped at the cafe" reads.';
COMMENT ON COLUMN public.activities.suffer_score IS
  'Strava-derived relative effort, 0-300+. Independent of in-app RPE; useful as cross-validation.';
COMMENT ON COLUMN public.activities.is_manual IS
  'True when the activity was manually entered in Strava (no device data). Debrief / tool layer should skip these.';
COMMENT ON COLUMN public.activities.is_trainer IS
  'True when the activity was indoor (turbo trainer, treadmill). Suppresses temperature / location / elevation reads downstream.';
COMMENT ON COLUMN public.activities.splits_metric IS
  'Per-km splits: distance, moving_time, average_speed, average_heartrate, pace_zone. Only present on rows whose ingest used the detail endpoint.';
COMMENT ON COLUMN public.activities.best_efforts IS
  'Strava auto-detected PR-eligible distances inside this activity (running only). Each entry: name, distance, elapsed_time, pr_rank, achievements. Detail endpoint only.';
COMMENT ON COLUMN public.activities.segment_efforts IS
  'Strava segment efforts inside this activity. Each entry: segment metadata + per-effort metrics + pr_rank, kom_rank. Detail endpoint with include_all_efforts=true only.';
