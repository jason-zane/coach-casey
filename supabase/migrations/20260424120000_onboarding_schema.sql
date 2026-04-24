-- Onboarding + V1 core tables. RLS on from day one per engineering-foundation.
-- Scoped to what the onboarding MVP needs; later tables (debriefs, chats,
-- weekly reviews, embeddings) are deferred.

-- =====================================================================
-- Athletes
-- =====================================================================

CREATE TABLE public.athletes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  onboarding_current_step text NOT NULL DEFAULT 'strava',
  onboarding_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX athletes_user_id_idx ON public.athletes(user_id);

CREATE TRIGGER athletes_set_updated_at
BEFORE UPDATE ON public.athletes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.athletes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "athletes read own" ON public.athletes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "athletes update own" ON public.athletes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Create athlete row on auth signup.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.athletes (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- =====================================================================
-- Strava connections
-- =====================================================================

CREATE TABLE public.strava_connections (
  athlete_id uuid PRIMARY KEY REFERENCES public.athletes(id) ON DELETE CASCADE,
  strava_athlete_id bigint,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  is_mock boolean NOT NULL DEFAULT false,
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER strava_connections_set_updated_at
BEFORE UPDATE ON public.strava_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.strava_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strava_connections read own" ON public.strava_connections
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );

-- =====================================================================
-- Activities (Strava, append-only)
-- =====================================================================

CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  strava_id bigint,
  start_date_local timestamptz NOT NULL,
  name text,
  activity_type text,
  distance_m numeric,
  moving_time_s integer,
  avg_pace_s_per_km numeric,
  avg_hr integer,
  max_hr integer,
  elevation_gain_m numeric,
  raw jsonb,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, strava_id)
);

CREATE INDEX activities_athlete_date_idx
  ON public.activities(athlete_id, start_date_local DESC);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities read own" ON public.activities
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );

-- =====================================================================
-- Validation observations (onboarding step 3)
-- =====================================================================

CREATE TABLE public.validation_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  sequence_idx integer NOT NULL,
  observation_text text NOT NULL,
  response_chip text,
  response_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX validation_observations_athlete_seq_idx
  ON public.validation_observations(athlete_id, sequence_idx);

ALTER TABLE public.validation_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "validation_observations read own" ON public.validation_observations
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );

-- =====================================================================
-- Training plans
-- =====================================================================

CREATE TABLE public.training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  source text NOT NULL,
  raw_text text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX training_plans_athlete_idx
  ON public.training_plans(athlete_id, created_at DESC);

ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_plans read own" ON public.training_plans
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );

-- =====================================================================
-- Goal races
-- =====================================================================

CREATE TABLE public.goal_races (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  name text,
  race_date date,
  goal_time_seconds integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER goal_races_set_updated_at
BEFORE UPDATE ON public.goal_races
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX goal_races_athlete_idx ON public.goal_races(athlete_id, is_active);

ALTER TABLE public.goal_races ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goal_races read own" ON public.goal_races
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );

-- =====================================================================
-- Memory items (injuries, niggles, context)
-- =====================================================================

CREATE TABLE public.memory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  kind text NOT NULL,
  content text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'onboarding',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX memory_items_athlete_kind_idx
  ON public.memory_items(athlete_id, kind, created_at DESC);

ALTER TABLE public.memory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memory_items read own" ON public.memory_items
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );

-- =====================================================================
-- Preferences (one row per athlete)
-- =====================================================================

CREATE TABLE public.preferences (
  athlete_id uuid PRIMARY KEY REFERENCES public.athletes(id) ON DELETE CASCADE,
  plan_follower_status text NOT NULL DEFAULT 'unknown',
  -- 'following' | 'deferred' | 'none' | 'unknown'
  push_enabled boolean NOT NULL DEFAULT false,
  email_enabled boolean NOT NULL DEFAULT true,
  pwa_installed_at timestamptz,
  weekly_review_day smallint NOT NULL DEFAULT 0,
  -- 0 = Sunday, 1 = Monday, ...
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER preferences_set_updated_at
BEFORE UPDATE ON public.preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "preferences read own" ON public.preferences
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );

-- =====================================================================
-- Trials
-- =====================================================================

CREATE TABLE public.trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  plan text NOT NULL DEFAULT 'v1-trial',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trials_athlete_idx ON public.trials(athlete_id, started_at DESC);

ALTER TABLE public.trials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trials read own" ON public.trials
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );
