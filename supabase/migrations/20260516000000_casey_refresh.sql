-- Casey refresh, schema additions for the 2026-05-16 voice + conversation
-- refresh. Covers:
--   1. Race tier (A / B / C) on goal_races
--   2. Proactive-surface idempotency tracking on messages.meta (no schema
--      change required, documented here)
--   3. Niggle-mention tracking on messages.meta (same, no schema change)
--
-- Coaching status is already on preferences.coaching_mode ('coach', 'self',
-- null), added 2026-04-28. No new column required.

-- =====================================================================
-- 1. Race tier on goal_races
-- =====================================================================
--
-- A = priority race, full 14-day prep, can't train through. The race-week
--     briefing fires T-14, T-7, T-3, T-2, T-1, race morning.
-- B = important, careful approach, 10-day window. Briefing fires T-10,
--     T-3, T-1, race morning.
-- C = train through where the discipline allows. Briefing fires T-1, race
--     morning. Rare for marathons.
--
-- Default is 'B'. A marathon without a tier is rarely a true
-- train-through race; the safe default is "treat it like a B" and let the
-- athlete bump it to A in the goal-race UI.

ALTER TABLE public.goal_races
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'B';

ALTER TABLE public.goal_races
  DROP CONSTRAINT IF EXISTS goal_races_tier_check;
ALTER TABLE public.goal_races
  ADD CONSTRAINT goal_races_tier_check
  CHECK (tier IN ('A', 'B', 'C'));

COMMENT ON COLUMN public.goal_races.tier IS
  'Race tier. A = priority race (full 14-day prep, no training through). B = important (10-day prep, careful approach). C = train through (rare for marathons). Scales the race-week briefing cadence.';

-- =====================================================================
-- 2. Race-week briefing idempotency (documentation only)
-- =====================================================================
--
-- Race-week briefings are inserted as messages with kind = 'casey_briefing'
-- (added by the message_kind extension below). Per-day idempotency is
-- keyed on meta->>'race_id' AND meta->>'day_marker' (e.g. 'T-7'), looked up
-- by the action layer before insert.
--
-- No unique index is added; the cardinality is low (one race, six markers
-- max), the existing thread_id + created_at index covers the lookup, and
-- the existence-check pattern matches the weekly-review action.

-- =====================================================================
-- 3. New message kinds for the proactive surfaces
-- =====================================================================
--
-- Adding new kinds requires extending the enum. Each new kind has its own
-- producer path and (eventually) UI typographic treatment.
--   casey_briefing  , race-week briefing, fuelling nudge, niggle
--                     escalation, mid-block flatness check-in.
--                     One kind covers all four surfaces because they share
--                     UI shape (Casey-authored, short, sometimes a
--                     question). The specific surface is recorded in
--                     meta.surface for analytics and re-fire gating.

ALTER TYPE public.message_kind ADD VALUE IF NOT EXISTS 'casey_briefing';

-- =====================================================================
-- 4. Per-kind push toggle for proactive briefings
-- =====================================================================
--
-- Existing per-kind toggles cover debriefs, cross-training, and weekly
-- reviews. The four new proactive surfaces (race-week briefing, fuelling
-- pre-run, niggle escalation, mid-block flatness) all flow through
-- kind='casey_briefing'. One toggle covers all of them, athletes who
-- find the proactive cadence too much can silence the bucket without
-- losing debriefs or weekly reviews. Defaults true so existing athletes
-- get the new surfaces automatically once the migration runs.

ALTER TABLE public.preferences
  ADD COLUMN IF NOT EXISTS briefing_push_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.preferences.briefing_push_enabled IS
  'Per-kind push toggle for proactive Casey briefings (race-week, fuelling, niggle escalation, mid-block flatness). Gated by master push_enabled.';

-- =====================================================================
-- 5. Helpful index for niggle counting
-- =====================================================================
--
-- niggle-escalation counts memory_items with kind = 'injury' for an
-- athlete in the last 14 days, optionally filtered by body part via tags.
-- The existing index on (athlete_id, kind, created_at DESC) covers the
-- date-window scan. No new index needed.
