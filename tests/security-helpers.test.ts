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

test("Strava OAuth remains read-only", () => {
  const client = readFileSync("lib/strava/client.ts", "utf8");
  assert.doesNotMatch(client, /activity:write/);
});
