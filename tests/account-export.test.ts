import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXPORT_TABLE_SECTIONS,
  EXPORT_SPECIAL_TABLES,
  EXPORT_EXCLUDED_TABLES,
} from "../lib/account/export-tables.ts";

// The account export 500ed in prod because it queried an activity_laps table
// no migration ever created (the migration of that name added a laps column
// to activities instead). These tests pin the export's table list to the
// schema the migrations actually build, in both directions.
//
// Regex-level SQL parsing is deliberate: the goal is table/column existence,
// not full SQL semantics, and the migrations are hand-written in a
// consistent style.

const MIGRATIONS_DIR = "supabase/migrations";

const sql = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
  .join("\n")
  // Strip line comments first: a ");" inside a comment would otherwise
  // truncate a CREATE TABLE block mid-body (athlete_insights has one).
  .replace(/--[^\n]*/g, "");

// table name -> DDL text (create body plus any later ALTER TABLE statements)
const tables = new Map<string, string>();
for (const m of sql.matchAll(
  /create table (?:if not exists )?(?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\);/gi,
)) {
  tables.set(m[1], m[2]);
}
for (const m of sql.matchAll(
  /alter table (?:if exists )?(?:only )?(?:public\.)?([a-z_]+)\b([\s\S]*?);/gi,
)) {
  const existing = tables.get(m[1]);
  if (existing !== undefined) tables.set(m[1], `${existing}\n${m[2]}`);
}
for (const m of sql.matchAll(
  /drop table (?:if exists )?(?:public\.)?([a-z_]+)/gi,
)) {
  tables.delete(m[1]);
}

test("migration parsing found the core tables", () => {
  // Guard the parser itself: if the regexes rot, every other test here
  // would vacuously pass or fail confusingly.
  for (const known of ["athletes", "activities", "messages", "preferences"]) {
    assert.ok(tables.has(known), `parser failed to find "${known}"`);
  }
});

test("every table the account export queries exists in the schema", () => {
  const queried = [
    ...EXPORT_TABLE_SECTIONS.map((s) => s.table),
    ...EXPORT_SPECIAL_TABLES,
  ];
  for (const table of queried) {
    assert.ok(
      tables.has(table),
      `account export queries "${table}" but no migration creates it ` +
        "(a missing relation is exactly what 500ed the export in prod)",
    );
  }
});

test("export sections only reference real columns", () => {
  for (const s of EXPORT_TABLE_SECTIONS) {
    const ddl = tables.get(s.table);
    if (!ddl) continue; // reported by the existence test above
    const referenced = [
      "athlete_id", // every section is scoped by .eq("athlete_id", ...)
      ...(s.order ? [s.order] : []),
      ...(s.columns ? s.columns.split(",").map((c) => c.trim()) : []),
    ];
    for (const col of referenced) {
      assert.ok(
        new RegExp(`\\b${col}\\b`).test(ddl),
        `account export references ${s.table}.${col} but the migrations never define it`,
      );
    }
  }
});

test("every athlete-linked table is exported or explicitly excluded", () => {
  const accounted = new Set([
    ...EXPORT_TABLE_SECTIONS.map((s) => s.table),
    ...EXPORT_SPECIAL_TABLES,
    ...Object.keys(EXPORT_EXCLUDED_TABLES),
  ]);
  for (const [table, ddl] of tables) {
    // Substring on purpose: also catches variants like target_athlete_id.
    if (!ddl.includes("athlete_id")) continue;
    assert.ok(
      accounted.has(table),
      `"${table}" holds athlete-linked rows but the account export neither ` +
        "exports it nor records why not in EXPORT_EXCLUDED_TABLES",
    );
  }
});

test("the exclusion list does not rot", () => {
  const exported = new Set(EXPORT_TABLE_SECTIONS.map((s) => s.table));
  for (const table of Object.keys(EXPORT_EXCLUDED_TABLES)) {
    assert.ok(
      tables.has(table),
      `EXPORT_EXCLUDED_TABLES lists "${table}" but no migration creates it`,
    );
    assert.ok(
      !exported.has(table),
      `"${table}" is both exported and excluded; drop it from one list`,
    );
  }
});
