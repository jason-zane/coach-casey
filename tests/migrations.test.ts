import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("athletes direct update policy is removed in migration", () => {
  const sql = readFileSync(
    "supabase/migrations/20260505201559_lock_down_athletes_update_policy.sql",
    "utf8",
  );
  assert.match(sql, /DROP POLICY IF EXISTS "athletes update own"/);
  assert.match(sql, /REVOKE UPDATE ON public\.athletes FROM anon, authenticated/);
});

test("messages read policy hides soft-deleted rows", () => {
  const sql = readFileSync(
    "supabase/migrations/20260505202854_add_data_integrity_checks.sql",
    "utf8",
  );
  assert.match(sql, /DROP POLICY IF EXISTS "messages read own"/);
  assert.match(sql, /deleted_at IS NULL/);
  assert.match(sql, /messages_athlete_live_idx/);
});
