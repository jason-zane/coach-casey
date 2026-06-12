-- Durable per-IP rate limiting for anonymous endpoints.
--
-- The anonymous client-error sink (app/api/observability/client-error) has a
-- body-size guard but no request-rate guard, so a caller could spray small
-- valid bodies and insert unlimited error_events rows plus PostHog captures.
-- This mirrors the chat limiter (consume_chat_rate_limit) but keys on a hashed
-- client IP -- a text key with no athletes FK -- so it works for
-- unauthenticated callers and stores no raw IP at rest. Service-role only; the
-- RPC does the read-modify-write atomically so concurrent requests cannot
-- overshoot the limit.
--
-- Growth is one row per distinct IP. Each row is self-healing (a returning IP
-- reuses and resets its row), so the table only accretes from never-seen-again
-- IPs; a periodic prune of rows whose window is far in the past can reclaim
-- those if it ever matters.

CREATE TABLE public.ip_rate_limits (
  ip_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.ip_rate_limits ENABLE ROW LEVEL SECURITY;

-- Atomically consume one unit against the IP's fixed window. Returns whether
-- the request is allowed and, when not, the seconds until the window resets.
-- The UPSERT + CASE keeps the read-modify-write race-free under concurrency: a
-- stale window resets to a fresh one, otherwise count increments. Mirrors
-- consume_chat_rate_limit; the only difference is the text IP-hash key.
CREATE OR REPLACE FUNCTION public.consume_ip_rate_limit(
  p_ip_hash text,
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
  INSERT INTO public.ip_rate_limits AS irl (ip_hash, window_started_at, count)
  VALUES (p_ip_hash, v_now, 1)
  ON CONFLICT (ip_hash) DO UPDATE
    SET
      window_started_at = CASE
        WHEN irl.window_started_at < v_now - make_interval(secs => p_window_seconds)
          THEN v_now
        ELSE irl.window_started_at
      END,
      count = CASE
        WHEN irl.window_started_at < v_now - make_interval(secs => p_window_seconds)
          THEN 1
        ELSE irl.count + 1
      END
  RETURNING irl.window_started_at, irl.count INTO v_window_start, v_count;

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

REVOKE ALL ON FUNCTION public.consume_ip_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_ip_rate_limit(text, integer, integer) TO service_role;
