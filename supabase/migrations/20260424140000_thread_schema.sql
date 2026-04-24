-- Home state & chat: one thread per athlete, messages as the base record.
-- Message type is a discriminator; chat, debriefs, weekly reviews, follow-ups,
-- and system messages all live in the same thread. Append-only — edits create
-- new rows rather than mutate.
--
-- pgvector is enabled here alongside an embeddings table scaffold. Indexes are
-- deliberately not created (per engineering-foundation §7: "Don't create vector
-- indexes speculatively"); semantic search lands in V1.1.

CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================================
-- Threads
-- =====================================================================

CREATE TABLE public.threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL UNIQUE REFERENCES public.athletes(id) ON DELETE CASCADE,
  -- Timestamp of the athlete's last view. Messages after this from Casey are
  -- "unread". Updated client-side on thread open.
  last_viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER threads_set_updated_at
BEFORE UPDATE ON public.threads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "threads read own" ON public.threads
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );

CREATE POLICY "threads update own" ON public.threads
  FOR UPDATE USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  ) WITH CHECK (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );

-- =====================================================================
-- Messages
-- =====================================================================

-- Message kind discriminator. Expand cautiously; each value implies a UI
-- typographic treatment and a producer path.
--   chat_user      — athlete-authored chat message
--   chat_casey     — Coach Casey reply to a chat message
--   debrief        — post-run debrief, Casey-authored, arrives unprompted
--   weekly_review  — Sunday review, Casey-authored, arrives on cadence
--   follow_up      — question attached to end of a debrief/review (Casey)
--   system         — rare operational message ("Strava reconnected")
CREATE TYPE public.message_kind AS ENUM (
  'chat_user',
  'chat_casey',
  'debrief',
  'weekly_review',
  'follow_up',
  'system'
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  kind public.message_kind NOT NULL,
  body text NOT NULL DEFAULT '',
  -- Freeform attachment for tool-use results, parent message refs, activity
  -- refs, in-progress streaming flags, etc. JSONB keeps the schema stable as
  -- message types pick up structured payloads.
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Full-text search column. `simple` config — English stemming drops
  -- athlete-relevant terms (run names, abbreviations) too aggressively.
  search_tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(body, ''))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_thread_created_idx
  ON public.messages(thread_id, created_at DESC);
CREATE INDEX messages_thread_created_asc_idx
  ON public.messages(thread_id, created_at ASC);
CREATE INDEX messages_search_idx
  ON public.messages USING GIN (search_tsv);
-- Calendar "dates with activity" queries run as timestamp range scans against
-- messages_thread_created_idx rather than a day-level expression index
-- (timestamptz → date cast is STABLE, not IMMUTABLE, so can't be indexed).

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages read own" ON public.messages
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );

-- Athlete-authored messages can be inserted by the athlete directly.
-- Casey messages are server-inserted via the admin client (bypasses RLS).
CREATE POLICY "messages insert own chat" ON public.messages
  FOR INSERT WITH CHECK (
    kind = 'chat_user'
    AND athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );

-- =====================================================================
-- Message embeddings (pgvector, V1.1)
-- =====================================================================
--
-- Scaffolded now so embedding generation can be wired without a later
-- migration. `text-embedding-3-small` produces 1536-dim vectors. No index
-- created — added surgically when semantic recall turns on.

CREATE TABLE public.message_embeddings (
  message_id uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  embedding vector(1536),
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.message_embeddings ENABLE ROW LEVEL SECURITY;

-- Embeddings are server-only for now; no athlete-facing read policy until
-- V1.1 semantic search ships and the access pattern is decided.

-- =====================================================================
-- Ensure-thread helper
-- =====================================================================
--
-- Called from onboarding completion and (defensively) on first thread load.
-- Idempotent — unique(athlete_id) enforces one thread per athlete.

CREATE OR REPLACE FUNCTION public.ensure_thread(p_athlete_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_thread_id uuid;
BEGIN
  SELECT id INTO v_thread_id FROM public.threads WHERE athlete_id = p_athlete_id;
  IF v_thread_id IS NOT NULL THEN
    RETURN v_thread_id;
  END IF;

  INSERT INTO public.threads (athlete_id)
  VALUES (p_athlete_id)
  ON CONFLICT (athlete_id) DO UPDATE SET athlete_id = excluded.athlete_id
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;
