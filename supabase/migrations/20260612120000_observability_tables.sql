-- Observability tables for the in-app admin dashboard.
--
-- Both are service-role-only: the app writes via the admin client and the
-- admin dashboard reads via the admin client behind a requireAdmin gate. RLS
-- is enabled with no policies so anon/authenticated roles get no direct
-- access (same pattern as public.message_embeddings).

CREATE TABLE public.error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 'error' | 'warn' | 'fatal'
  level text NOT NULL DEFAULT 'error',
  -- where it came from: 'route' | 'cron' | 'webhook' | 'action' | 'client' | 'pipeline'
  source text NOT NULL,
  name text,
  message text NOT NULL,
  stack text,
  -- Next.js error digest, lets a client error-boundary report correlate with
  -- the server-side onRequestError capture.
  digest text,
  route text,
  athlete_id uuid REFERENCES public.athletes(id) ON DELETE SET NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX error_events_created_idx ON public.error_events (created_at DESC);
CREATE INDEX error_events_source_idx ON public.error_events (source, created_at DESC);

ALTER TABLE public.error_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  -- null while running, true/false once finished
  ok boolean,
  duration_ms integer,
  -- per-job result summary (counts, errors)
  stats jsonb,
  error text
);

CREATE INDEX cron_runs_job_started_idx ON public.cron_runs (job, started_at DESC);

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
