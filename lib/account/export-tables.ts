/**
 * Single source of truth for what the account export
 * (app/api/account/export/route.ts) includes. The route iterates
 * EXPORT_TABLE_SECTIONS to build the dump, and
 * tests/account-export.test.ts checks every entry here against the tables
 * and columns the migrations actually create, in both directions: a table
 * queried here but absent from the schema fails CI (the activity_laps bug
 * that 500ed the export in prod), and a new athlete-linked table that is
 * neither exported nor listed in EXPORT_EXCLUDED_TABLES fails CI too, so
 * leaving athlete data out of the export is always a recorded decision.
 *
 * Kept dependency-free so the node:test suite can import it without the
 * Next.js host.
 */

export type ExportTableSection = {
  /** Table name; also the key the rows appear under in the export JSON. */
  table: string;
  /**
   * Columns to select. Defaults to everything; narrowed where rows carry
   * values that serve no portability purpose (push keys, auth material).
   */
  columns?: string;
  /** Column to sort by so repeated exports diff cleanly. */
  order?: string;
};

export const EXPORT_TABLE_SECTIONS: ExportTableSection[] = [
  // Lap data lives in activities.laps (jsonb), there is no activity_laps
  // table, so a "*" select carries the laps along with each activity.
  { table: "activities", order: "start_date_local" },
  { table: "activity_notes", order: "created_at" },
  { table: "messages", order: "created_at" },
  { table: "coach_messages", order: "created_at" },
  { table: "memory_items", order: "created_at" },
  { table: "validation_observations", order: "sequence_idx" },
  { table: "training_plans", order: "created_at" },
  { table: "goal_races", order: "race_date" },
  {
    table: "push_subscriptions",
    columns: "endpoint, created_at, last_used_at, last_error_at, last_error_code",
    order: "created_at",
  },
  { table: "trials", order: "started_at" },
  { table: "athlete_insights", order: "recorded_at" },
];

/**
 * Tables the export reads outside the generic loop: the athlete row itself,
 * the singleton preferences row, and the Strava connection (secrets
 * stripped).
 */
export const EXPORT_SPECIAL_TABLES = [
  "athletes",
  "preferences",
  "strava_connections",
];

/**
 * Athlete-linked tables deliberately not exported, with the reason. Adding a
 * table here is the only way to keep an athlete-linked table out of the
 * export without failing tests/account-export.test.ts.
 */
export const EXPORT_EXCLUDED_TABLES: Record<string, string> = {
  threads:
    "container row only (one per athlete, no content); its messages are exported",
  message_embeddings:
    "derived vectors over messages that are exported in full; not portable data",
  chat_rate_limits:
    "operational rate-limit counter, not athlete-provided data",
  error_events:
    "operational telemetry; the athlete link is incidental debugging context",
  audit_log:
    "compliance log (keyed by target_athlete_id); disclosed via support requests, not self-serve export",
};
