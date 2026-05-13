import assert from "node:assert/strict";
import test from "node:test";
import { isRateLimited } from "../lib/strava/rate-limit.ts";

// The ingest fan-out loop in `lib/strava/ingest.ts` short-circuits once it
// sees a 429 from Strava (the alternative is burning the rest of the
// 15-minute budget on calls that all 429 too). The detection key is the
// thrown Error's message, which is built in `lib/strava/client.ts`. These
// assertions pin the exact shape so a future refactor that changes the
// error message format trips a test instead of silently re-introducing
// the budget-burning bug.

test("isRateLimited detects Strava 429 errors", () => {
  // Real-world shape from `fetchActivityDetail`:
  //   `Strava activity detail 1234 failed: 429 {"message":"Rate Limit Exceeded",...}`
  assert.equal(
    isRateLimited(
      new Error(
        'Strava activity detail 17609210133 failed: 429 {"message":"Rate Limit Exceeded","errors":[]}',
      ),
    ),
    true,
  );
  // Real-world shape from `fetchAthleteProfileWithToken`:
  //   `Strava /athlete failed: 429 {"message":"Rate Limit Exceeded",...}`
  assert.equal(
    isRateLimited(
      new Error(
        'Strava /athlete failed: 429 {"message":"Rate Limit Exceeded"}',
      ),
    ),
    true,
  );
  // Belt-and-braces: matches the message text alone too, so an upstream
  // change that drops the status code from the error template still trips
  // the abort.
  assert.equal(
    isRateLimited(new Error("strava: rate limit exceeded")),
    true,
  );
});

test("isRateLimited rejects non-429 errors and non-Errors", () => {
  assert.equal(isRateLimited(new Error("Strava /athlete failed: 401 {}")), false);
  assert.equal(isRateLimited(new Error("Strava activity detail 1 failed: 500 server")), false);
  assert.equal(isRateLimited(new Error("network unreachable")), false);
  assert.equal(isRateLimited(null), false);
  assert.equal(isRateLimited("429"), false);
  assert.equal(isRateLimited(undefined), false);
});
