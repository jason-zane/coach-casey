-- Strava verdict line: on by default.
--
-- Founder decision 2026-06-12: the verdict line ships enabled so athletes
-- get it without hunting for a settings toggle. It stays one tap to turn
-- off in Settings > Strava, is disclosed during onboarding and in the
-- privacy policy, and remains gated on the connection actually holding
-- the activity:write OAuth scope.
--
-- Note: docs/strava-application-pack.md described this feature to Strava
-- as off by default. That pack carries a status note and must be revised
-- before any future Strava correspondence quotes it.

ALTER TABLE public.preferences
  ALTER COLUMN strava_blurb_enabled SET DEFAULT true;

-- One-time launch-state flip. At this point production holds a single real
-- athlete (the founder, who requested default-on), so there are no
-- athlete-chosen opt-outs to preserve.
UPDATE public.preferences SET strava_blurb_enabled = true;

COMMENT ON COLUMN public.preferences.strava_blurb_enabled IS
  'Casey appends a one-line verdict + signature to the Strava activity description after each debrief. Default on; one-tap off in Settings; also gated on the connection holding activity:write.';
