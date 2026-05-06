-- V1 MVP feature push:
--   1. Plan ingestion expansion (image/PDF + extracted-text storage)
--   2. is_test_user flag for friend-testing cohort separation
--
-- Both changes share a migration so we don't churn on three near-empty files.

-- =====================================================================
-- 1. Plan ingestion: training_plans accepts image/pdf alongside pasted text
-- =====================================================================
--
-- Existing schema kept the source as a free-text label and the parsed text
-- in `raw_text`. For vision-extracted plans we want to know:
--   - what the original was (filename + mime), purely for athlete-facing
--     display, e.g. "block-12.pdf, uploaded May 7"
--   - whether the athlete confirmed the extracted text after Sonnet ran,
--     vs accepted-by-default after a few seconds
--
-- The original file is NOT stored. Extraction happens in-flight at upload
-- time and only the extracted text is persisted, keeping us well clear of
-- Storage bucket setup and storage costs at MVP scale. If a re-extract is
-- needed later the athlete uploads the file again.

ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS source_filename text,
  ADD COLUMN IF NOT EXISTS source_mime text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

COMMENT ON COLUMN public.training_plans.source IS
  'Origin of the plan: ''text'' (pasted), ''image'' (screenshot), ''pdf'' (document). Drives the upload-flow read-back UI.';
COMMENT ON COLUMN public.training_plans.source_filename IS
  'Original filename of an uploaded image or PDF. NULL for pasted text. Display-only.';
COMMENT ON COLUMN public.training_plans.source_mime IS
  'MIME type of the uploaded file (image/jpeg, image/png, application/pdf). NULL for pasted text.';
COMMENT ON COLUMN public.training_plans.confirmed_at IS
  'Set when the athlete reviewed the extracted text and pressed Save. NULL on a pasted plan (no extraction step) and on a deferred / opted-out path.';

-- Index supports the "what is the active plan?" lookup pattern used by the
-- prompt context builder. Existing index covers (athlete, created_at), but
-- we always filter by is_active=true first, so a covering partial helps.
CREATE INDEX IF NOT EXISTS training_plans_active_idx
  ON public.training_plans(athlete_id, created_at DESC)
  WHERE is_active = true;

-- =====================================================================
-- 2. is_test_user: friend-testing cohort flag
-- =====================================================================
--
-- Friend testing means real athletes sign up alongside paying ones. We need
-- a simple, single-bit way to tag the friend cohort so:
--   - any future analytics can exclude them
--   - any future paid-feature gating can let them through
--   - the admin surface can show them at a glance
--
-- Default false. Toggled from the admin surface. Not user-editable.

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS is_test_user boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.athletes.is_test_user IS
  'True when the athlete is part of an internal / friend-testing cohort. Set from the admin surface. Excluded from production-cohort metrics.';

-- Cheap partial index so admin filters on test-cohort stay snappy as the
-- table grows.
CREATE INDEX IF NOT EXISTS athletes_test_users_idx
  ON public.athletes(id) WHERE is_test_user = true;
