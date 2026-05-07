"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js on first mount for any visitor.
 *
 * Pre-V1 the service worker only registered during the notifications
 * onboarding step, which meant athletes who declined push (or never
 * reached that step) had no SW at all, so PWA cold-launches always
 * went full-network for every JS / CSS / icon chunk. The notifications
 * flow still calls register() with the same scope; the SDK dedupes,
 * so registering here as well is safe.
 *
 * Errors are silent: registration is a perf optimisation, not a
 * functional requirement, the app must keep working when the browser
 * blocks SWs (private mode, certain mobile contexts).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Defer registration until after the page is interactive so we
    // don't compete with the initial paint for network bandwidth.
    const idle = () =>
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    if (document.readyState === "complete") {
      idle();
    } else {
      window.addEventListener("load", idle, { once: true });
    }
  }, []);

  return null;
}
