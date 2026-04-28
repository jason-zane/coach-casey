-- Scale foundations. Small additive changes the surrounding features (cross-
-- training, future substitution detection, prompt-version tracking, per-kind
-- push control) all depend on. Grouped here because none individually warrants
-- its own migration and they ship together.
--
-- 1. athletes.timezone       , IANA TZ name. Needed to compute day-of-week
--                               in the athlete's local time for pattern
--                               detection and future plan adherence queries.
--                               Nullable: existing athletes have no value
--                               until they reconnect or we backfill from
--                               Strava profile / browser locale. Callers
--                               must fall back to UTC when null.
--
-- 2. messages.model_version,
--    messages.prompt_version , Identify the LLM model + prompt revision
--                               that produced each Casey-authored message.
--                               Populated by every generation path going
--                               forward. Existing rows stay NULL; the
--                               fields are additive, not a rewrite.
--
-- 3. messages.deleted_at     , Soft-delete marker. Used when a Strava
--                               activity is deleted upstream (debrief
--                               becomes orphaned) or when we need to hide
--                               a message without breaking the append-only
--                               audit trail. Readers filter on this column;
--                               existing queries are unaffected because
--                               NULL means "live".
--
-- 4. preferences.*_push_enabled, Split the single `push_enabled` toggle into
--                               per-kind sub-toggles. Master `push_enabled`
--                               stays as the global gate. Athletes now have
--                               granular control over which Casey surfaces
--                               trigger a push. All sub-toggles default true;
--                               the master stays opt-in as before.

ALTER TABLE public.athletes
  ADD COLUMN timezone text;

COMMENT ON COLUMN public.athletes.timezone IS
  'IANA timezone (e.g. Australia/Sydney). Null until captured from Strava profile or browser. Consumers fall back to UTC when null.';

ALTER TABLE public.messages
  ADD COLUMN model_version text,
  ADD COLUMN prompt_version text,
  ADD COLUMN deleted_at timestamptz;

COMMENT ON COLUMN public.messages.model_version IS
  'The LLM model that produced this message (e.g. claude-sonnet-4-6). Null for athlete-authored messages.';
COMMENT ON COLUMN public.messages.prompt_version IS
  'The prompt revision that produced this message (e.g. post-run-debrief@v1). Null for athlete-authored messages.';
COMMENT ON COLUMN public.messages.deleted_at IS
  'Soft-delete marker. Non-null rows are hidden from thread reads.';

-- Soft-delete filter index: threads load "live" messages ordered by time,
-- and every such query now wants `deleted_at IS NULL`. Partial index keeps
-- the hot path cheap regardless of how many rows are eventually soft-deleted.
CREATE INDEX messages_thread_live_idx
  ON public.messages (thread_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.preferences
  ADD COLUMN debrief_push_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN cross_training_push_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN weekly_review_push_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.preferences.debrief_push_enabled IS
  'Per-kind push toggle for post-run debriefs. Gated by master push_enabled.';
COMMENT ON COLUMN public.preferences.cross_training_push_enabled IS
  'Per-kind push toggle for cross-training acknowledgements. Gated by master push_enabled.';
COMMENT ON COLUMN public.preferences.weekly_review_push_enabled IS
  'Per-kind push toggle for Sunday weekly reviews. Gated by master push_enabled.';
