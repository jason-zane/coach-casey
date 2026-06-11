import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { safeNextPath } from "../lib/security/redirects.ts";
import { sameOriginPath } from "../lib/security/same-origin-path.ts";

test("safeNextPath accepts only same-site paths", () => {
  assert.equal(safeNextPath(null), "/app");
  assert.equal(safeNextPath("/app?tab=settings"), "/app?tab=settings");
  assert.equal(safeNextPath("https://evil.example/app"), "/app");
  assert.equal(safeNextPath("//evil.example/app"), "/app");
  assert.equal(safeNextPath("/app\\evil"), "/app");
  assert.equal(safeNextPath("/app\u0000evil"), "/app");
});

test("sameOriginPath normalizes push URLs to paths", () => {
  const origin = "https://coachcasey.app";
  assert.equal(sameOriginPath(undefined, "/app", origin), "/app");
  assert.equal(sameOriginPath("/app?x=1#today", "/app", origin), "/app?x=1#today");
  assert.equal(
    sameOriginPath("https://coachcasey.app/app/settings", "/app", origin),
    "/app/settings",
  );
  assert.equal(sameOriginPath("https://evil.example/app", "/app", origin), "/app");
});

// The 2026-05-07 hardening pinned the client to read-only scopes. The
// opt-in description verdict (restored 2026-06-12) reintroduces
// activity:write on purpose, so the tripwire now pins the narrower
// contract instead: the exact scope ask, and a write surface that is
// one PUT carrying only the description field.
test("Strava write surface stays scoped to the description verdict", () => {
  const client = readFileSync("lib/strava/client.ts", "utf8");
  assert.match(
    client,
    /scope: "read,activity:read_all,activity:write,profile:read_all"/,
  );
  assert.doesNotMatch(client, /profile:write/);
  // The only field Casey ever writes is the activity description.
  assert.match(client, /JSON\.stringify\(\{ description \}\)/);
  // And the only API mutation in the module is that single PUT.
  assert.equal(client.match(/method: "PUT"/g)?.length ?? 0, 1);
});
