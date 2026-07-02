-- Enforce the invite gate at the account level.
--
-- Accounts can be minted through any GoTrue self-serve surface — the Google
-- OAuth flow, or /auth/v1/otp called directly with the public anon key and
-- create_user=true — which bypasses the app's invite-code checks entirely
-- (prod audit, Jul 2026). Rather than trusting the entry surfaces, the gate
-- is now recorded on the athlete row: invite-checked flows stamp
-- signup_authorized_at via the service role, and the auth callback, the
-- proxy, and requireAthlete refuse (and the callback deletes) accounts that
-- never got stamped. See lib/auth/invite.ts.
--
-- Service-role-only by construction: 20260505201559 revoked UPDATE on
-- athletes from anon/authenticated, so a browser client cannot self-stamp.

ALTER TABLE public.athletes
  ADD COLUMN signup_authorized_at timestamptz;

-- Grandfather every existing account: they all came through the invited
-- email flow (or are the founder's own accounts).
UPDATE public.athletes
SET signup_authorized_at = created_at
WHERE signup_authorized_at IS NULL;
