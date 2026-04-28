-- Coaching mode on preferences.
--
-- Captures who is writing the athlete's training: 'coach' (a human coach
-- assigning sessions, athlete is in a coached relationship), 'self' (self-
-- directed, following a public plan, template, or self-built block), or
-- NULL (unknown / not asked yet).
--
-- The distinction matters for Casey's posture. With a coach, Casey defers
-- to the coach's intent and helps the athlete read what is happening
-- inside the plan. Self-directed, Casey can engage more directly with
-- workout choices and substitutions when asked.
--
-- Captured at the plan step in onboarding (when the athlete shares a
-- plan), and editable on the athlete profile page so it can be set later
-- for athletes who deferred or opted out of the plan upload.

ALTER TABLE public.preferences
  ADD COLUMN IF NOT EXISTS coaching_mode text;

ALTER TABLE public.preferences
  DROP CONSTRAINT IF EXISTS preferences_coaching_mode_check;

ALTER TABLE public.preferences
  ADD CONSTRAINT preferences_coaching_mode_check
  CHECK (coaching_mode IS NULL OR coaching_mode IN ('coach', 'self'));

COMMENT ON COLUMN public.preferences.coaching_mode IS
  'Who writes the training: coach (human coach), self (self-directed / public plan / template), or NULL (unknown).';
