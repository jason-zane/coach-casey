import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
