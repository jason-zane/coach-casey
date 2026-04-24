export type OnboardingStep =
  | "strava"
  | "validation"
  | "plan"
  | "install"
  | "goal-race"
  | "injury"
  | "welcome";

export const ONBOARDING_STEP_ORDER_MOBILE: OnboardingStep[] = [
  "strava",
  "validation",
  "plan",
  "install",
  "goal-race",
  "injury",
  "welcome",
];

export const ONBOARDING_STEP_ORDER_DESKTOP: OnboardingStep[] = [
  "strava",
  "validation",
  "plan",
  "goal-race",
  "injury",
  "welcome",
];

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
  validation: "A look at your training",
  plan: "Your training plan",
  install: "Put Coach Casey on your home screen",
  "goal-race": "Your next race",
  injury: "Anything to know",
  welcome: "What to expect",
};
