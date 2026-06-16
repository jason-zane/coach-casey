-- =====================================================================
-- Interpreted-memory layer (athlete_insights)
-- =====================================================================
--
-- Casey's maintained "read" of an athlete. Distinct from the two raw
-- stores it sits on top of:
--   - activities  : what happened (the system of record)
--   - memory_items: raw captures from chat (niggles, life context)
-- athlete_insights holds interpretations Casey has FORMED and carries
-- forward: who this runner is, learned patterns, the current block's
-- thesis, and the open coaching threads. The consolidation pass writes
-- it; every surface reads the hot subset.
--
-- Pruning is demotion, not deletion: a resolved insight goes status
-- 'closed' and hot=false (retained, retrievable by tag) rather than
-- being removed, so a year-old injury is never forgotten.

CREATE TABLE public.athlete_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,

  -- Which layer of the maintained read this belongs to.
  --   'profile' : durable who-this-runner-is facts (change rarely)
  --   'pattern' : learned patterns about THIS athlete (accumulate)
  --   'block'   : current training block + thesis (shifts over weeks)
  --   'thread'  : open coaching/conversational threads (per interaction)
  layer text NOT NULL CHECK (layer IN ('profile', 'pattern', 'block', 'thread')),

  content text NOT NULL,

  -- Lifecycle. 'live' = current; 'resolving' = fading; 'closed' = demoted
  -- to archive (retained, not loaded by default); 'superseded' = replaced
  -- by a newer version (see supersedes).
  status text NOT NULL DEFAULT 'live'
    CHECK (status IN ('live', 'resolving', 'closed', 'superseded')),

  -- Promotion discipline: never load a low-confidence pattern by default.
  confidence text NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('low', 'medium', 'high')),

  -- Whether this sits in the always-loaded working read. The hot set is
  -- bounded per layer; cold rows stay retrievable on demand (by tag) but
  -- are not loaded into every prompt.
  hot boolean NOT NULL DEFAULT false,

  -- Retrieval index. Body part for injuries, theme keys, etc.
  tags text[] NOT NULL DEFAULT '{}',

  -- Provenance: what supports this belief, so it is auditable and the
  -- consolidation pass can re-evaluate it rather than trusting it blindly.
  evidence text,

  -- Time-coding. The three distinct temporal facts a coach reasons over:
  --   event_at           : when it was true / happened
  --   recorded_at        : when Casey wrote it
  --   last_referenced_at : when it last mattered (bumped on resurfacing;
  --                        drives hot/cold demotion)
  event_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  last_referenced_at timestamptz NOT NULL DEFAULT now(),

  -- As-of / supersession for facts that change (block thesis, profile
  -- attributes). Don't overwrite; close the old with valid_until and link
  -- the replacement via supersedes, so "what was true then" is answerable
  -- and Casey never asserts a stale fact as current.
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  supersedes uuid REFERENCES public.athlete_insights(id) ON DELETE SET NULL,

  -- Whether this is a recognised recurrence of a prior (closed) insight.
  recurrence boolean NOT NULL DEFAULT false,

  -- Which surface/consolidation produced it ('weekly_review', 'debrief',
  -- 'chat', 'manual').
  source text NOT NULL DEFAULT 'consolidation',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER athlete_insights_set_updated_at
BEFORE UPDATE ON public.athlete_insights
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Working-read load path: hot rows for an athlete, freshest first.
CREATE INDEX athlete_insights_hot_idx
  ON public.athlete_insights(athlete_id, hot, last_referenced_at DESC);

-- Per-layer scans (consolidation reads the full live set for an athlete).
CREATE INDEX athlete_insights_layer_idx
  ON public.athlete_insights(athlete_id, layer, status);

-- Tag retrieval for recurrence detection and on-demand pulls.
CREATE INDEX athlete_insights_tags_idx
  ON public.athlete_insights USING GIN (tags);

ALTER TABLE public.athlete_insights ENABLE ROW LEVEL SECURITY;

-- Athletes can read their own insights (legibility: Casey's beliefs about
-- you are visible to you). Writes go through the service role
-- (consolidation) and audited server actions, which bypass RLS.
CREATE POLICY "athlete_insights read own" ON public.athlete_insights
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );
