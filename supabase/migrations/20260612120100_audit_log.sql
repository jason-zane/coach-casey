-- Append-only audit log for sensitive and admin actions.
--
-- Service-role-only: written and read via the admin client (dashboard read is
-- behind requireAdmin). RLS enabled with no policies so anon/authenticated
-- roles cannot read it directly.

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 'athlete' | 'admin' | 'system'
  actor_type text NOT NULL,
  -- athlete id or admin auth user id; null for system/cron
  actor_id uuid,
  -- captured for admin actions so the log is legible without a join
  actor_email text,
  -- dotted action key, e.g. 'account.delete', 'strava.connect',
  -- 'admin.regenerate_debrief'
  action text NOT NULL,
  target_athlete_id uuid REFERENCES public.athletes(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_log_created_idx ON public.audit_log (created_at DESC);
CREATE INDEX audit_log_target_idx ON public.audit_log (target_athlete_id, created_at DESC);
CREATE INDEX audit_log_action_idx ON public.audit_log (action, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
