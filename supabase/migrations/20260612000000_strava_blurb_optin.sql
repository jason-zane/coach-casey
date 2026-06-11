-- Opt-in for Casey's Strava description blurb.
--
-- After each debrief, Casey can append a one-line verdict plus the fixed
-- signature ("coached by Coach Casey · coachcasey.app") to the bottom of
-- that activity's description on Strava. The write path was removed in the
-- 2026-05-07 security hardening and is restored behind this flag.
--
-- Strictly opt-in: default false, flipped from Settings > Strava. The
-- debrief pipeline checks this preference AND that the athlete's Strava
-- connection actually holds the activity:write OAuth scope before
-- generating or writing anything. Athletes connected before the scope was
-- added keep read-only behaviour until they reconnect.

ALTER TABLE public.preferences
  ADD COLUMN IF NOT EXISTS strava_blurb_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.preferences.strava_blurb_enabled IS
  'Opt-in: Casey appends a one-line verdict + signature to the Strava activity description after each debrief. Default off; also gated on the connection holding activity:write.';
