import {
  type OnboardingStep,
  stepIsAhead,
  stepOrderFor,
} from "./steps.ts";

/** The page a completed-but-DOB-less athlete is held on until they fill it in. */
const BACKFILL_PATH = "/onboarding/about-you";

export type AthleteRouteInput = {
  pathname: string;
  searchParams: URLSearchParams;
  onboardingComplete: boolean;
  /** The athlete's onboarding cursor (defaulted to "strava" by the caller). */
  currentStep: string;
  hasDateOfBirth: boolean;
  userAgent: string | null;
};

export type AthleteRouteRedirect = {
  pathname: string;
  /** Query string without the leading "?". Omitted means no query. */
  search?: string;
};

/**
 * Pure routing decision for an authenticated athlete on the app/onboarding
 * surfaces. Returns a redirect, or null to let the request render. Called
 * from updateSession() in lib/supabase/middleware.ts; kept pure so the gate
 * graph can be tested for termination (no redirect cycles) without a
 * Supabase client.
 *
 * Gates, in order:
 *   - /signin | /signup            → /app (complete) or /onboarding
 *   - /app && incomplete           → /onboarding
 *   - complete && no DOB           → held on /onboarding/about-you?backfill=1
 *     (athletes who completed onboarding before the about-you step existed,
 *     or who skipped it; the backfill page itself must render or the two
 *     rules would ping-pong forever — the ERR_TOO_MANY_REDIRECTS brick)
 *   - /onboarding && complete      → /app
 *   - exact /onboarding            → /onboarding/{currentStep}
 *   - /onboarding/{step} ahead of the cursor → /onboarding/{currentStep}
 *     (step completion is positional, so rendering a later step would let
 *     its action skip every step in between — including DOB capture)
 */
export function resolveAthleteRoute(
  input: AthleteRouteInput,
): AthleteRouteRedirect | null {
  const {
    pathname,
    searchParams,
    onboardingComplete,
    currentStep,
    hasDateOfBirth,
    userAgent,
  } = input;
  const needsDobBackfill = onboardingComplete && !hasDateOfBirth;

  if (pathname === "/signin" || pathname === "/signup") {
    return { pathname: onboardingComplete ? "/app" : "/onboarding" };
  }

  const onApp = pathname.startsWith("/app");
  const onOnboarding = pathname.startsWith("/onboarding");
  if (!onApp && !onOnboarding) return null;

  if (onApp && !onboardingComplete) {
    return { pathname: "/onboarding" };
  }

  if (needsDobBackfill) {
    if (pathname === BACKFILL_PATH) {
      if (searchParams.get("backfill") === "1") return null;
      // Canonicalise direct hits on the page: keep whatever else is in the
      // query (the form's ?error=… round-trips) and add the backfill flag
      // so the page renders the backfill copy and the form posts it back.
      const search = new URLSearchParams(searchParams);
      search.set("backfill", "1");
      return { pathname: BACKFILL_PATH, search: search.toString() };
    }
    return { pathname: BACKFILL_PATH, search: "backfill=1" };
  }

  if (onOnboarding && onboardingComplete) {
    return { pathname: "/app" };
  }

  if (pathname === "/onboarding" || pathname === "/onboarding/") {
    return { pathname: `/onboarding/${currentStep}` };
  }

  // Forward-jump gate. Only known steps are gated: interstitials like
  // /onboarding/reading pass through, and a cursor this UA's order doesn't
  // contain (e.g. "install" opened on desktop) skips the gate rather than
  // guessing — completeOnboarding()'s DOB check is the backstop.
  const segment = pathname.split("/")[2] ?? "";
  const order = stepOrderFor(userAgent);
  if (
    stepIsAhead(
      segment as OnboardingStep,
      currentStep as OnboardingStep,
      order,
    )
  ) {
    return { pathname: `/onboarding/${currentStep}` };
  }

  return null;
}
