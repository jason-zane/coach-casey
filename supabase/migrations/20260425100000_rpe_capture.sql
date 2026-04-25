-- RPE capture per `docs/rpe-feature-spec.md`.
--
-- Two surfaces:
--   1) `activity_notes` — one row per activity, RPE columns nullable. The
--      spec describes "new columns" on activity_notes; the table didn't
--      exist yet, so it's introduced here scoped to RPE only. Future
--      per-activity notes can extend the same row.
--   2) `athletes.rpe_prompts_paused_until` — pause flag set when the
--      athlete hits the consecutive-skip threshold. Checked on every
--      potential prompt display.
--
-- RLS pattern matches the rest of the schema: athlete-scoped read, writes
-- go through the admin client from server actions.

CREATE TABLE public.activity_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL UNIQUE REFERENCES public.activities(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  -- RPE state. `rpe_value` is only set when `rpe_answered_at` is set;
  -- `rpe_skipped_at` is set on explicit dismissal. The two timestamps are
  -- mutually exclusive — an activity is either answered or skipped, never
  -- both.
  rpe_value smallint,
  rpe_prompted_at timestamptz,
  rpe_answered_at timestamptz,
  rpe_skipped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_notes_rpe_value_range
    CHECK (rpe_value IS NULL OR (rpe_value BETWEEN 1 AND 10)),
  CONSTRAINT activity_notes_rpe_value_requires_answered
    CHECK ((rpe_value IS NULL) = (rpe_answered_at IS NULL)),
  CONSTRAINT activity_notes_answered_xor_skipped
    CHECK (rpe_answered_at IS NULL OR rpe_skipped_at IS NULL)
);

-- Per-athlete consecutive-skip query in `lib/rpe/skip-count.ts` orders by
-- prompted-at desc; the index supports it directly.
CREATE INDEX activity_notes_athlete_prompted_idx
  ON public.activity_notes(athlete_id, rpe_prompted_at DESC)
  WHERE rpe_prompted_at IS NOT NULL;

CREATE TRIGGER activity_notes_set_updated_at
BEFORE UPDATE ON public.activity_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.activity_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_notes read own" ON public.activity_notes
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );

-- Pause state on athletes.
--
--   `rpe_prompts_paused_until` — when set and in the future, prompts are
--     suppressed.
--   `rpe_skip_count_anchor_at` — moment the most recent pause was
--     triggered. Consecutive-skip counting only considers prompts after
--     this point, so the post-pause re-prompt gets a fresh 5-skip
--     threshold (per spec §8.4) rather than instantly re-pausing on the
--     5 skips that caused the previous pause.
ALTER TABLE public.athletes
  ADD COLUMN rpe_prompts_paused_until timestamptz,
  ADD COLUMN rpe_skip_count_anchor_at timestamptz;
