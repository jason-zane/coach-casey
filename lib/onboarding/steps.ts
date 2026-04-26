export type OnboardingStep =
  | "strava"
  | "recent-race"
  | "validation"
  | "plan"
  | "install"
  | "notifications"
  | "goal-race"
  | "injury"
  | "welcome";

/**
 * `recent-race` is the engineering surface for the race-input step per
 * `docs/training-load-feature-spec.md` §5.2 + §11. UX (copy, layout,
 * skip framing) is launch-prep work; the step is included in the
 * onboarding order only when the feature flag is on.
 */
function recentRaceEnabled(): boolean {
  const v = process.env.ONBOARDING_RACE_INPUT_FLAG;
  if (!v) return false;
  const lower = v.toLowerCase();
  return lower === "on" || lower === "1" || lower === "true";
}

function withRecentRace(base: OnboardingStep[]): OnboardingStep[] {
  if (!recentRaceEnabled()) return base;
  // Insert immediately after Strava — the race result is independent of
  // Strava connection, but pacing-wise it sits before validation so the
  // "look at your training" moment can already factor in the threshold.
  const out: OnboardingStep[] = [];
  for (const step of base) {
    out.push(step);
    if (step === "strava") out.push("recent-race");
  }
  return out;
}

const BASE_MOBILE: OnboardingStep[] = [
  "strava",
  "validation",
  "plan",
  "install",
  // notifications sits right after install: standalone PWA on iOS is the
  // only context where push is reliable, so the prompt happens while that
  // standalone context is still front of mind.
  "notifications",
  "goal-race",
  "injury",
  "welcome",
];

const BASE_DESKTOP: OnboardingStep[] = [
  "strava",
  "validation",
  "plan",
  // Desktop browsers can subscribe to web push without install; offer it
  // here too, even though the channel is secondary on desktop.
  "notifications",
  "goal-race",
  "injury",
  "welcome",
];

export const ONBOARDING_STEP_ORDER_MOBILE: OnboardingStep[] = withRecentRace(BASE_MOBILE);
export const ONBOARDING_STEP_ORDER_DESKTOP: OnboardingStep[] = withRecentRace(BASE_DESKTOP);

export function isMobileUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
}

export type MobilePlatform =
  | "ios-safari"
  | "ios-chrome"
  | "ios-firefox"
  | "ios-other"
  | "android-chrome"
  | "android-other"
  | "desktop";

/**
 * Narrower platform detection for the install step. On iOS every browser
 * runs WebKit under the hood, but only Safari natively supports PWA install
 * via Share > Add to Home Screen in a way the user expects. Chrome-on-iOS
 * and Firefox-on-iOS need different copy.
 */
export function detectMobilePlatform(
  ua: string | null | undefined,
): MobilePlatform {
  if (!ua) return "desktop";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (isIOS) {
    if (/CriOS/i.test(ua)) return "ios-chrome";
    if (/FxiOS/i.test(ua)) return "ios-firefox";
    if (/Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua))
      return "ios-safari";
    return "ios-other";
  }
  if (/Android/i.test(ua)) {
    if (/Chrome/i.test(ua) && !/SamsungBrowser|EdgA|OPR/i.test(ua))
      return "android-chrome";
    return "android-other";
  }
  return "desktop";
}

export function stepOrderFor(ua: string | null | undefined): OnboardingStep[] {
  return isMobileUserAgent(ua)
    ? ONBOARDING_STEP_ORDER_MOBILE
    : ONBOARDING_STEP_ORDER_DESKTOP;
}

export function nextStep(
  current: OnboardingStep,
  order: OnboardingStep[],
): OnboardingStep | "done" {
  const idx = order.indexOf(current);
  if (idx === -1 || idx === order.length - 1) return "done";
  return order[idx + 1];
}

export const STEP_TITLES: Record<OnboardingStep, string> = {
  strava: "Connect Strava",
  "recent-race": "A recent race",
  validation: "A look at your training",
  plan: "Your training plan",
  install: "Put Coach Casey on your home screen",
  notifications: "Stay in the loop",
  "goal-race": "Your next race",
  injury: "Anything to know",
  welcome: "What to expect",
};
