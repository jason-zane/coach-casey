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

test("strava_athlete_id is unique across connections (partial index)", () => {
  const sql = readFileSync(
    "supabase/migrations/20260612080000_unique_strava_athlete_id.sql",
    "utf8",
  );
  // Dedupe runs first so a database that already holds duplicate claims
  // can't block the index creation.
  assert.match(sql, /DELETE FROM public\.strava_connections/);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX strava_connections_strava_athlete_id_uniq/,
  );
  // Partial: NULL strava_athlete_id rows (mock/dev connects, pre-heal live
  // connects, the two legacy production rows) must stay allowed.
  assert.match(sql, /WHERE strava_athlete_id IS NOT NULL/);
});
