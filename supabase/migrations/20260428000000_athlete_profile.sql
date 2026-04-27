-- Athlete profile fields for the new /app/athlete page.
--
-- weight_kg, sex, date_of_birth: populated from Strava's GET /athlete
-- profile when the athlete connects (sync to be wired in a follow-up).
-- weight is kg, sex is 'M' / 'F' / 'X' / null as Strava returns it,
-- date_of_birth is filled by chat capture or manual entry — Strava's
-- profile endpoint does not expose DOB.
--
-- units: athlete's preferred display units. 'metric' or 'imperial'.
-- Lives on athletes (not preferences) so the same row carries every
-- per-athlete display knob the page reads.

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS weight_kg numeric,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS units text NOT NULL DEFAULT 'metric';

ALTER TABLE public.athletes
  ADD CONSTRAINT athletes_units_check
  CHECK (units IN ('metric', 'imperial'));

COMMENT ON COLUMN public.athletes.weight_kg IS
  'Athlete weight in kg. Sourced from Strava /athlete on connect; nullable until populated.';
COMMENT ON COLUMN public.athletes.sex IS
  'Strava-shaped sex marker (''M'', ''F'', ''X'', or null). Display layer formats for presentation.';
COMMENT ON COLUMN public.athletes.date_of_birth IS
  'Date of birth. Captured via chat or manual entry — Strava does not expose DOB. Used to derive age for the athlete page.';
COMMENT ON COLUMN public.athletes.units IS
  'Display preference: ''metric'' or ''imperial''. Defaults to metric.';
