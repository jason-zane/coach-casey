-- Per-bucket RPE pause state and per-bucket skip counting. RPE prompts
-- now pause per-bucket (run vs cross-training) instead of globally, so
-- a "rides aren't useful" skip pattern doesn't kill run RPE.
-- See docs/post-run-debrief-moment.md §6.

-- 1. Bucket on activity_notes. Denormalised at insert from
--    activities.activity_type. Two values: 'run' (type contains "run")
--    and 'xtrain' (everything else). Finer granularity is deferred to
--    V1.1 with dogfood evidence.

ALTER TABLE public.activity_notes
  ADD COLUMN bucket text;

-- Backfill from activities.activity_type so the NOT NULL constraint
-- can land in the same migration.
UPDATE public.activity_notes n
SET bucket = CASE
  WHEN COALESCE(LOWER(a.activity_type), '') LIKE '%run%' THEN 'run'
  ELSE 'xtrain'
END
FROM public.activities a
WHERE n.activity_id = a.id;

ALTER TABLE public.activity_notes
  ALTER COLUMN bucket SET NOT NULL,
  ADD CONSTRAINT activity_notes_bucket_chk
    CHECK (bucket IN ('run', 'xtrain'));

COMMENT ON COLUMN public.activity_notes.bucket IS
  'RPE skip-bucket scope. Set once at insert from activities.activity_type. See docs/post-run-debrief-moment.md §6.';

-- 2. Replace the prompted-at index with a bucket-aware version. The
--    consecutive-skip query in lib/rpe/skip-count.ts now scopes by
--    bucket; the index includes it as the second key so the same
--    partial-index strategy stays cheap.

DROP INDEX IF EXISTS public.activity_notes_athlete_prompted_idx;
CREATE INDEX activity_notes_athlete_bucket_prompted_idx
  ON public.activity_notes(athlete_id, bucket, rpe_prompted_at DESC)
  WHERE rpe_prompted_at IS NOT NULL;

-- 3. Per-bucket pause state on athletes. Existing single-column pause
--    held "global" pause data, but the only ingest path until very
--    recently was runs, so existing values are semantically run-bucket.
--    Renaming preserves data; adding the _xtrain counterparts opens
--    cross-training pauses without touching run state.

ALTER TABLE public.athletes
  RENAME COLUMN rpe_prompts_paused_until TO rpe_prompts_paused_until_run;
ALTER TABLE public.athletes
  RENAME COLUMN rpe_skip_count_anchor_at TO rpe_skip_count_anchor_at_run;

ALTER TABLE public.athletes
  ADD COLUMN rpe_prompts_paused_until_xtrain timestamptz,
  ADD COLUMN rpe_skip_count_anchor_at_xtrain timestamptz;

COMMENT ON COLUMN public.athletes.rpe_prompts_paused_until_run IS
  'Run-bucket RPE pause: when set and in the future, RPE prompts on run activities are suppressed. Set on 5 consecutive active skips on runs. See docs/post-run-debrief-moment.md §6.';
COMMENT ON COLUMN public.athletes.rpe_prompts_paused_until_xtrain IS
  'Cross-training-bucket RPE pause: when set and in the future, RPE prompts on cross-training activities are suppressed.';
COMMENT ON COLUMN public.athletes.rpe_skip_count_anchor_at_run IS
  'Anchor for the run-bucket consecutive-skip count post-pause. See lib/rpe/skip-count.ts.';
COMMENT ON COLUMN public.athletes.rpe_skip_count_anchor_at_xtrain IS
  'Anchor for the cross-training-bucket consecutive-skip count post-pause.';
