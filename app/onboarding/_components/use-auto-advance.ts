"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

/**
 * Robust driver for onboarding screens that move to the next step on their
 * own (the post-Strava "reading" screen, the already-installed PWA shortcut).
 *
 * It exists because the previous bare `setTimeout` + fire-and-forget
 * `startTransition` could strand people:
 *
 *   - Mobile browsers freeze JS timers the instant the tab is backgrounded
 *     (lock screen, app switch). If iOS then discards the tab, the queued
 *     advance never runs. Confirmed in production: a new user sat on
 *     /onboarding/reading for ~12 minutes after the Strava pull had already
 *     finished, because the post-settle timer was frozen and never fired.
 *   - A thrown error from the action was swallowed, leaving a screen that
 *     still looked busy with no way forward.
 *
 * This driver closes every gap:
 *   - auto-fires `delayMs` after `enabled` turns true
 *   - ALSO re-fires whenever the tab returns to the foreground (or is
 *     restored from the bfcache), so a frozen timer can't trap anyone
 *   - surfaces real errors and clears the in-flight guard so the consumer's
 *     manual control doubles as a retry
 *
 * The consumer MUST always render a manual control wired to `run` — that's the
 * guarantee that one tap always moves forward, regardless of timers, tab
 * visibility, or a transient failure. A server action's `redirect()` is not a
 * client-side throw, so the try/catch only ever catches genuine failures and
 * never interferes with the navigation.
 */
export function useAutoAdvance(
  action: () => Promise<void>,
  { enabled, delayMs = 0 }: { enabled: boolean; delayMs?: number },
): { pending: boolean; error: string | null; run: () => void } {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  // Keep the latest action without making `run` (and therefore the auto-fire
  // effect) change identity every render, which would re-arm the timer.
  // Synced in an effect rather than during render so the ref write is legal.
  const actionRef = useRef(action);
  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  const run = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        // Success redirects; navigation unmounts us before this resolves.
        await actionRef.current();
      } catch (e) {
        // Clear the guard so the manual control works as a retry.
        inFlightRef.current = false;
        setError(e instanceof Error ? e.message : "Couldn’t continue.");
      }
    });
  }, []);

  // Auto-fire after the hold once enabled.
  useEffect(() => {
    if (!enabled) return;
    if (delayMs <= 0) {
      run();
      return;
    }
    const t = setTimeout(run, delayMs);
    return () => clearTimeout(t);
  }, [enabled, delayMs, run]);

  // Re-fire on return-to-foreground (frozen-timer recovery) and on bfcache
  // restore. Harmless once we've navigated away — the component is unmounted
  // and the listeners are torn down.
  useEffect(() => {
    if (!enabled) return;
    const refire = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", refire);
    window.addEventListener("pageshow", refire);
    return () => {
      document.removeEventListener("visibilitychange", refire);
      window.removeEventListener("pageshow", refire);
    };
  }, [enabled, run]);

  return { pending, error, run };
}
