-- Foundation migration: required extensions and shared helper functions.
-- No tables yet — the data model is intentionally deferred. This migration
-- only sets up what every future migration will depend on.

-- Extensions -----------------------------------------------------------------

-- gen_random_uuid() — preferred over uuid-ossp for new code.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Legacy uuid_generate_v4() support. Supabase enables this by default;
-- the IF NOT EXISTS keeps the migration idempotent.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Query-level observability. Supabase's Reports UI and advisors rely on this.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Helper functions -----------------------------------------------------------

-- Attach to any table that has an `updated_at timestamptz` column:
--   CREATE TRIGGER set_updated_at
--   BEFORE UPDATE ON <table>
--   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
