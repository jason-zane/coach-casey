import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveAthleteRoute,
  type AthleteRouteInput,
} from "../lib/onboarding/routing.ts";
import {
  ONBOARDING_STEP_ORDER_DESKTOP,
  ONBOARDING_STEP_ORDER_MOBILE,
  stepIsAhead,
} from "../lib/onboarding/steps.ts";

// Pins the athlete routing gate graph, in particular that it terminates.
// The prod brick this guards against (Jul 2026): an athlete with
// onboarding_completed_at set but date_of_birth NULL looped forever between
// "/onboarding && complete → /app" and "/app && no DOB → about-you?backfill=1"
// (ERR_TOO_MANY_REDIRECTS on /app, /signin, and /app/settings — the account
// could not even be deleted).

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";

type Cohort = Omit<AthleteRouteInput, "pathname" | "searchParams">;

const bricked: Cohort = {
  onboardingComplete: true,
  currentStep: "injury",
  hasDateOfBirth: false,
  userAgent: DESKTOP_UA,
};

const healthy: Cohort = {
  onboardingComplete: true,
  currentStep: "injury",
  hasDateOfBirth: true,
  userAgent: DESKTOP_UA,
};

function fresh(currentStep: string, userAgent = DESKTOP_UA): Cohort {
  return {
    onboardingComplete: false,
    currentStep,
    hasDateOfBirth: false,
    userAgent,
  };
}

function route(cohort: Cohort, pathname: string, search = "") {
  return resolveAthleteRoute({
    ...cohort,
    pathname,
    searchParams: new URLSearchParams(search),
  });
}

/**
 * Follow redirects until a request renders, failing on any cycle. Mirrors
 * what the browser does across requests: each redirect target is fed back
 * through the gate.
 */
function follow(cohort: Cohort, pathname: string, search = "") {
  const seen = new Set<string>();
  for (;;) {
    const key = `${pathname}?${search}`;
    assert.ok(!seen.has(key), `redirect loop through ${key}`);
    seen.add(key);
    const decision = route(cohort, pathname, search);
    if (!decision) return { pathname, search, hops: seen.size - 1 };
    pathname = decision.pathname;
    search = decision.search ?? "";
  }
}

test("bricked cohort (complete + NULL dob) terminates on the backfill page from every entry point", () => {
  for (const entry of ["/app", "/app/settings", "/signin", "/onboarding/injury"]) {
    const terminal = follow(bricked, entry);
    assert.equal(terminal.pathname, "/onboarding/about-you", `from ${entry}`);
    assert.equal(
      new URLSearchParams(terminal.search).get("backfill"),
      "1",
      `from ${entry}`,
    );
    assert.ok(terminal.hops <= 3, `from ${entry}: took ${terminal.hops} hops`);
  }
});

test("backfill page renders for the bricked cohort instead of bouncing to /app", () => {
  assert.equal(route(bricked, "/onboarding/about-you", "backfill=1"), null);
});

test("backfill redirect preserves the form's error round-trip", () => {
  const decision = route(bricked, "/onboarding/about-you", "error=dob");
  assert.ok(decision);
  const search = new URLSearchParams(decision.search);
  assert.equal(decision.pathname, "/onboarding/about-you");
  assert.equal(search.get("backfill"), "1");
  assert.equal(search.get("error"), "dob");
});

test("healthy completed athlete is unaffected", () => {
  assert.equal(route(healthy, "/app"), null);
  assert.equal(route(healthy, "/app/settings"), null);
  assert.deepEqual(route(healthy, "/signin"), { pathname: "/app" });
  assert.deepEqual(route(healthy, "/onboarding/about-you"), {
    pathname: "/app",
  });
  assert.deepEqual(route(healthy, "/onboarding/injury"), { pathname: "/app" });
});

test("incomplete athlete cannot jump ahead of the cursor", () => {
  const atStrava = fresh("strava");
  // Direct navigation to any later step bounces back to the cursor, so the
  // later step's positional advanceFrom() can never fire — landing on
  // /onboarding/injury used to complete onboarding with no DOB captured.
  for (const later of ["about-you", "validation", "plan", "goal-race", "injury"]) {
    assert.deepEqual(
      route(atStrava, `/onboarding/${later}`),
      { pathname: "/onboarding/strava" },
      `/onboarding/${later}`,
    );
  }
  assert.equal(route(atStrava, "/onboarding/strava"), null);
  assert.deepEqual(route(atStrava, "/onboarding"), {
    pathname: "/onboarding/strava",
  });
});

test("incomplete athlete can revisit earlier steps and interstitials", () => {
  const atPlan = fresh("plan");
  assert.equal(route(atPlan, "/onboarding/about-you"), null);
  assert.equal(route(atPlan, "/onboarding/plan"), null);
  // /onboarding/reading is not a step; it must keep rendering (the Strava
  // callback lands there while the cursor is still "strava").
  assert.equal(route(fresh("strava"), "/onboarding/reading"), null);
  assert.deepEqual(route(atPlan, "/app"), { pathname: "/onboarding" });
});

test("cursor unknown to this UA's order skips the jump gate rather than guessing", () => {
  // "install" exists only in the mobile order; the same athlete opening the
  // flow on desktop must not be bounced to a step the desktop order lacks.
  const crossDevice = fresh("install", DESKTOP_UA);
  assert.equal(route(crossDevice, "/onboarding/notifications"), null);
  // On mobile the cursor is known, so the gate applies normally.
  const onMobile = fresh("install", MOBILE_UA);
  assert.equal(route(onMobile, "/onboarding/install"), null);
  assert.deepEqual(route(onMobile, "/onboarding/notifications"), {
    pathname: "/onboarding/install",
  });
});

test("stepIsAhead is positional within an order and permissive outside it", () => {
  const mobile = ONBOARDING_STEP_ORDER_MOBILE;
  const desktop = ONBOARDING_STEP_ORDER_DESKTOP;
  assert.equal(stepIsAhead("injury", "strava", mobile), true);
  assert.equal(stepIsAhead("validation", "about-you", mobile), true);
  assert.equal(stepIsAhead("about-you", "about-you", mobile), false);
  assert.equal(stepIsAhead("strava", "plan", mobile), false);
  assert.equal(stepIsAhead("install", "plan", desktop), false);
  assert.equal(stepIsAhead("notifications", "install", desktop), false);
});
