-- Training-load foundation per `docs/training-load-feature-spec.md`.
--
-- Two surfaces:
--   1) `activity_notes` — four new columns on the existing per-activity row:
--      load_au, load_method, load_if, load_calculated_at. Populated by the
--      load calculator on Strava ingest. Null when calculation hasn't run
--      yet or the activity has no usable duration/pace.
--   2) `profile_snapshots` — new table, append-only. Each row is a dated
--      snapshot of the athlete's threshold/VDOT picture from a single
--      source (race, shadow, manual). The "current" snapshot is the
--      latest row by `snapshot_date` with `pending_review = false`.
--
-- RLS pattern matches the rest of the schema: athlete-scoped reads via
-- the athlete-table join (auth.uid() is the user_id, not the athlete_id),
-- writes go through the admin client from server actions.

-- =====================================================================
-- activity_notes — load columns
-- =====================================================================

ALTER TABLE public.activity_notes
  ADD COLUMN load_au real,
  ADD COLUMN load_method text,
  ADD COLUMN load_if real,
  ADD COLUMN load_calculated_at timestamptz;

ALTER TABLE public.activity_notes
  ADD CONSTRAINT activity_notes_load_au_nonneg
    CHECK (load_au IS NULL OR load_au >= 0),
  ADD CONSTRAINT activity_notes_load_if_range
    CHECK (load_if IS NULL OR (load_if >= 0.4 AND load_if <= 1.5)),
  ADD CONSTRAINT activity_notes_load_method_values
    CHECK (
      load_method IS NULL
      OR load_method IN ('pace_rtss', 'duration_default', 'cross_training')
    ),
  ADD CONSTRAINT activity_notes_load_method_with_au
    CHECK ((load_au IS NULL) = (load_method IS NULL));

COMMENT ON COLUMN public.activity_notes.load_au IS
  'Per-activity training load in arbitrary units (AU). 100 AU ≈ one hour at threshold pace. Null when calculation has not run or inputs are missing.';
COMMENT ON COLUMN public.activity_notes.load_method IS
  'Tier that produced load_au: pace_rtss (run with threshold), duration_default (run without threshold), cross_training (non-run).';
COMMENT ON COLUMN public.activity_notes.load_if IS
  'Intensity factor used for the calculation (clamped 0.4–1.5). Null for cross_training (placeholder constant, not measured).';
COMMENT ON COLUMN public.activity_notes.load_calculated_at IS
  'Timestamp of the last load calculation for this row. Updated on every (re)calc.';

-- Supports the CTL/ATL read query joining activities → activity_notes
-- on athlete_id with date filtering.
CREATE INDEX activity_notes_athlete_load_idx
  ON public.activity_notes (athlete_id)
  INCLUDE (load_au, load_method)
  WHERE load_au IS NOT NULL;

-- =====================================================================
-- profile_snapshots
-- =====================================================================
--
-- First migration to define this table. The data-model named it but
-- earlier features didn't need it. Append-only. Future snapshot kinds
-- (VO2 baseline, rolling fitness markers) will add columns; existing
-- rows will keep them null.

CREATE TABLE public.profile_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  -- snapshot_date is the *date the snapshot represents* (e.g. the race
  -- date for race-derived rows, the run-date for shadow rows). Distinct
  -- from created_at, which is when we wrote the row.
  snapshot_date date NOT NULL,
  source text NOT NULL,
  source_activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,

  -- VDOT and derived paces. All nullable so future snapshot kinds can
  -- omit them (e.g. an HRV-based snapshot wouldn't carry pace).
  vdot real,
  threshold_pace_sec_per_km real,
  easy_pace_sec_per_km_low real,
  easy_pace_sec_per_km_high real,
  marathon_pace_sec_per_km real,
  interval_pace_sec_per_km real,
  repetition_pace_sec_per_km real,

  confidence text NOT NULL,
  pending_review boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT profile_snapshots_source_values
    CHECK (source IN ('race', 'tempo_estimate', 'shadow', 'manual')),
  CONSTRAINT profile_snapshots_confidence_values
    CHECK (confidence IN ('high', 'medium', 'low'))
);

COMMENT ON TABLE public.profile_snapshots IS
  'Append-only physiology snapshots. Old rows are never modified or deleted (except the pending_review flag); a new row supersedes by date.';
COMMENT ON COLUMN public.profile_snapshots.pending_review IS
  'True when an auto-detected race produced a >1-VDOT-lower revision than the current snapshot. The snapshot remains inert until the athlete confirms or rejects.';

-- Recent-snapshot lookups: "current threshold for this athlete" runs
-- this index every load calculation.
CREATE INDEX profile_snapshots_athlete_recent_idx
  ON public.profile_snapshots (athlete_id, snapshot_date DESC);

ALTER TABLE public.profile_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_snapshots read own" ON public.profile_snapshots
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );

-- Inserts and the `pending_review` toggle are athlete-scoped via the
-- standard pattern. Service role (admin client) bypasses RLS for
-- system-driven writes (auto-snapshot from races, shadow refresh,
-- recalculation pipeline).
CREATE POLICY "profile_snapshots insert own" ON public.profile_snapshots
  FOR INSERT WITH CHECK (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );

CREATE POLICY "profile_snapshots update own review flag" ON public.profile_snapshots
  FOR UPDATE USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  ) WITH CHECK (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );
