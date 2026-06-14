-- Direct messages between a human coach (currently the founder) and an
-- athlete. Deliberately separate from public.messages (the athlete<->Casey
-- thread): these never touch Casey's AI flow. sender='coach' is a human
-- message to the athlete; sender='athlete' is the athlete's reply to the
-- human. read_at marks when the *recipient* has seen the message (so coach
-- messages are unread until the athlete opens /app/messages, and athlete
-- messages are unread until the coach opens the conversation).
--
-- Service-role only: RLS is enabled with no policies. Athlete-facing reads
-- and writes go through scoped server actions/loaders that resolve the
-- athlete from the session and enforce ownership, matching the rest of the
-- app's service-role + explicit-ownership pattern. Idempotent.

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  sender text not null check (sender in ('coach', 'athlete')),
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists coach_messages_athlete_created_idx
  on public.coach_messages (athlete_id, created_at desc);

create index if not exists coach_messages_unread_idx
  on public.coach_messages (athlete_id)
  where read_at is null;

alter table public.coach_messages enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) touches
-- this table, always behind an ownership or admin check in app code.
