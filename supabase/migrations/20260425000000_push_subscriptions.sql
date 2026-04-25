-- Web Push subscriptions per athlete. One athlete can have multiple
-- subscriptions (different devices, browsers, reinstalls). Endpoint is the
-- canonical browser-issued URL the push service is reachable at; uniqueness
-- on it prevents duplicates from re-subscribing the same device.

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  -- Bookkeeping for diagnostics + pruning. last_error_code captures
  -- 404/410 from the push service so we can drop dead endpoints.
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  last_error_at timestamptz,
  last_error_code integer,
  UNIQUE (endpoint)
);

CREATE INDEX push_subscriptions_athlete_idx
  ON public.push_subscriptions(athlete_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Read-own so the athlete can see their devices in settings (future). Writes
-- go through server actions via the admin client.
CREATE POLICY "push_subscriptions read own" ON public.push_subscriptions
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
  );
