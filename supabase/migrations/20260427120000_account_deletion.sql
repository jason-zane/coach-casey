-- Account deletion: soft-delete with a 30-day window before hard-delete.
-- The athlete row is the canonical "deleted?" gate; the actual auth.users
-- and related rows are purged by the daily cron at /api/cron/account-purge,
-- which calls auth.admin.deleteUser() and lets the existing ON DELETE
-- CASCADE chain remove activities, messages, memory_items, etc.
--
-- We deliberately don't add deleted_at to every owned table, that would
-- be churn for no benefit. Sign-in is gated on athletes.deleted_at, which
-- is enough to prevent any access during the window.

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS athletes_deleted_at_idx
  ON public.athletes(deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN public.athletes.deleted_at IS
  'Soft-delete marker. Set by Settings → Delete account or via privacy@. '
  'Hard-deletion occurs ~30 days later via /api/cron/account-purge.';
