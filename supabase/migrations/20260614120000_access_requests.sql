-- Early-access requests captured from the public request form
-- (/signup with no invite code). Service-role only: RLS is enabled with no
-- policies, so anon and authenticated clients cannot read or write the table.
-- The request action inserts via the service-role client; the admin surface
-- (behind the ADMIN_EMAILS gate) reads and updates via the service-role client.
--
-- Idempotent so it is safe to re-run.

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'invited', 'joined', 'declined')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null
);

create index if not exists access_requests_created_at_idx
  on public.access_requests (created_at desc);

alter table public.access_requests enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) may read
-- or write this table.
