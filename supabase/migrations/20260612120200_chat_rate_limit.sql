-- Durable chat rate limiting.
--
-- Replaces the per-instance in-memory limiter so the cap holds across Fluid
-- Compute instances and cold starts. Fixed window per athlete. Service-role
-- only table; the RPC does the read-modify-write atomically so concurrent
-- requests cannot overshoot the limit.

CREATE TABLE public.chat_rate_limits (
  athlete_id uuid PRIMARY KEY REFERENCES public.athletes(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.chat_rate_limits ENABLE ROW LEVEL SECURITY;

-- Atomically consume one unit against the athlete's fixed window. Returns
-- whether the request is allowed and, when not, the seconds until the window
-- resets. The UPSERT + CASE keeps the read-modify-write race-free under
-- concurrency: a stale window resets to a fresh one, otherwise count
-- increments.
CREATE OR REPLACE FUNCTION public.consume_chat_rate_limit(
  p_athlete_id uuid,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
  v_now timestamptz := now();
BEGIN
  INSERT INTO public.chat_rate_limits AS crl (athlete_id, window_started_at, count)
  VALUES (p_athlete_id, v_now, 1)
  ON CONFLICT (athlete_id) DO UPDATE
    SET
      window_started_at = CASE
        WHEN crl.window_started_at < v_now - make_interval(secs => p_window_seconds)
          THEN v_now
        ELSE crl.window_started_at
      END,
      count = CASE
        WHEN crl.window_started_at < v_now - make_interval(secs => p_window_seconds)
          THEN 1
        ELSE crl.count + 1
      END
  RETURNING crl.window_started_at, crl.count INTO v_window_start, v_count;

  IF v_count <= p_limit THEN
    allowed := true;
    retry_after_seconds := 0;
  ELSE
    allowed := false;
    retry_after_seconds := GREATEST(
      1,
      CEIL(
        EXTRACT(
          EPOCH FROM (v_window_start + make_interval(secs => p_window_seconds) - v_now)
        )
      )::integer
    );
  END IF;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_chat_rate_limit(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_chat_rate_limit(uuid, integer, integer) TO service_role;
