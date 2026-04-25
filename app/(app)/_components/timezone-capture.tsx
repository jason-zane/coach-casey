"use client";

import { useEffect, useRef } from "react";
import { setAthleteTimezoneIfMissing } from "@/app/actions/timezone";

/**
 * Mount-once hook that ships the browser's resolved IANA timezone to the
 * server. The server action is a no-op when a timezone is already
 * captured, so calling on every (app) mount is fine — the round-trip
 * happens once per athlete, then short-circuits forever.
 *
 * Failures are silent: timezone capture is best-effort and the server
 * falls back to UTC for pattern detection when it's missing.
 */
export function TimezoneCapture() {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      void setAthleteTimezoneIfMissing(tz);
    } catch {
      // Ignore — older browsers without resolvedOptions support fall
      // back to the server's UTC handling.
    }
  }, []);

  return null;
}
