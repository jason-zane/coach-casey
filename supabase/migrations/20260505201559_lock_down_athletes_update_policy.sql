-- Lock direct browser updates to the athletes row.
--
-- The original MVP policy allowed an authenticated athlete to update their
-- whole row. Later migrations added operational columns to this same table
-- (soft-delete markers, backfill state, detail-fetch counters), so broad
-- client-side UPDATE access is no longer safe. Athlete profile changes now go
-- through scoped server actions using the service role and explicit ownership
-- checks.

DROP POLICY IF EXISTS "athletes update own" ON public.athletes;

-- Defense in depth for Supabase's Data API: even if a future policy is added
-- accidentally, authenticated clients should not have blanket table-level
-- UPDATE on every athletes column.
REVOKE UPDATE ON public.athletes FROM anon, authenticated;
