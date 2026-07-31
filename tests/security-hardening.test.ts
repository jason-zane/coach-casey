import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clientIpFromHeaders } from "../lib/observability/client-ip.ts";

// These are source-level regression guards in the same spirit as
// migrations.test.ts and the "Strava OAuth remains read-only" check: they
// assert the hardening properties hold so a future refactor cannot silently
// undo them. They need no database or Next runtime.

const CRON_JOBS = [
  "strava-poll",
  "weekly-review",
  "proactive-surfaces",
  "history-backfill",
  "deep-backfill",
  "account-purge",
];

// H1: the athlete-id-parameterized generators must not be exposed as server
// actions (a "use server" file turns every export into a public endpoint).
test("cross-tenant generators are server-only, not server actions", () => {
  for (const file of [
    "app/actions/proactive-surfaces.ts",
    "app/actions/weekly-review.ts",
  ]) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(
      src,
      /^\s*["']use server["']/m,
      `${file} must not be a server-action module`,
    );
    assert.match(src, /import "server-only"/, `${file} must be server-only`);
  }
});

// L1: every cron route authorizes through the shared constant-time helper and
// no longer inlines the plain-string CRON_SECRET comparison.
test("all cron routes use the constant-time cron secret helper", () => {
  for (const job of CRON_JOBS) {
    const src = readFileSync(`app/api/cron/${job}/route.ts`, "utf8");
    assert.match(
      src,
      /verifyCronSecret\(request\)/,
      `${job} must call verifyCronSecret`,
    );
    assert.doesNotMatch(
      src,
      /process\.env\.CRON_SECRET/,
      `${job} must not inline the CRON_SECRET check`,
    );
  }
});

// L2: the destructive purge cron is capped per run.
test("account-purge enforces a per-run delete cap", () => {
  const src = readFileSync("app/api/cron/account-purge/route.ts", "utf8");
  assert.match(src, /MAX_PURGE_PER_RUN/);
  assert.match(src, /\.limit\(MAX_PURGE_PER_RUN\)/);
});

// M2: chat uses the durable DB rate limiter, not the per-instance map.
test("chat route uses durable rate limiting", () => {
  const src = readFileSync("app/api/chat/route.ts", "utf8");
  assert.match(src, /consumeChatRateLimit/);
  assert.doesNotMatch(
    src,
    /__coachCaseyChatRate/,
    "in-memory chat limiter must be gone",
  );
});

// M3: sensitive flows write to the audit log.
test("sensitive actions record audit events", () => {
  for (const file of [
    "app/actions/account.ts",
    "app/actions/strava.ts",
    "app/actions/admin.ts",
    "app/api/strava/callback/route.ts",
    "app/api/account/export/route.ts",
  ]) {
    const src = readFileSync(file, "utf8");
    assert.match(
      src,
      /recordAuditEvent/,
      `${file} must record an audit event`,
    );
  }
});

// M4: the anonymous client-error sink is per-IP throttled. Without it, the
// 64KB size guard added in PR #74 still lets a caller spray small valid bodies
// and insert unlimited error_events rows.
test("anonymous client-error endpoint is per-IP rate limited", () => {
  const src = readFileSync(
    "app/api/observability/client-error/route.ts",
    "utf8",
  );
  // Throttle is consulted and keyed on the request IP...
  assert.match(src, /consumeIpRateLimit\(clientIpFromHeaders\(req\.headers\)\)/);
  // ...and a tripped limit returns 429 with a Retry-After header.
  assert.match(src, /status:\s*429/);
  assert.match(src, /"retry-after":\s*String\(rate\.retryAfterSeconds\)/);
});

// M4: the IP limiter is durable (DB-backed, cross-instance) and fails open so a
// limiter outage cannot break legitimate error reporting.
test("ip rate limiter is durable and fails open", () => {
  const src = readFileSync("lib/observability/rate-limit-db.ts", "utf8");
  assert.match(src, /consume_ip_rate_limit/, "must call the durable RPC");
  // Fail-open: any error (or a null IP) allows the request through.
  assert.match(src, /allowing/);
  assert.match(src, /return \{ ok: true \}/);
});

// M4: the durable IP limiter is backed by a migration mirroring the chat one:
// a service-role-only table + atomic consume RPC, keyed by a text IP hash.
test("ip rate limit migration defines a service-role table and RPC", () => {
  const sql = readFileSync(
    "supabase/migrations/20260612120300_observability_rate_limit.sql",
    "utf8",
  );
  assert.match(sql, /CREATE TABLE public\.ip_rate_limits/);
  assert.match(sql, /ip_hash text PRIMARY KEY/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.consume_ip_rate_limit\(/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.consume_ip_rate_limit\(text, integer, integer\) FROM PUBLIC/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.consume_ip_rate_limit\(text, integer, integer\) TO service_role/,
  );
});

// M4: the IP extraction trusts the left-most x-forwarded-for entry (the
// originating client on Vercel), falls back to x-real-ip, and returns null when
// no usable header is present so the limiter can fail open.
test("client IP is parsed from the proxy headers, null when absent", () => {
  assert.equal(
    clientIpFromHeaders(
      new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" }),
    ),
    "203.0.113.7",
  );
  assert.equal(
    clientIpFromHeaders(new Headers({ "x-forwarded-for": "  198.51.100.9  " })),
    "198.51.100.9",
  );
  assert.equal(
    clientIpFromHeaders(new Headers({ "x-real-ip": "192.0.2.44" })),
    "192.0.2.44",
  );
  assert.equal(clientIpFromHeaders(new Headers()), null);
  assert.equal(clientIpFromHeaders(new Headers({ "x-forwarded-for": "" })), null);
});

// OBS: server instrumentation and the swallowed webhook path report errors.
test("error capture is wired into instrumentation and the webhook", () => {
  const instr = readFileSync("instrumentation.ts", "utf8");
  assert.match(instr, /onRequestError/);
  assert.match(instr, /captureError/);

  const webhook = readFileSync(
    "app/api/strava/webhook/[secret]/route.ts",
    "utf8",
  );
  assert.match(
    webhook,
    /captureError/,
    "webhook after() failures must be captured",
  );
});
