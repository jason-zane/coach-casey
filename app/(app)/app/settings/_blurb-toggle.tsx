"use client";

import { useTransition } from "react";

type Props = {
  enabled: boolean;
  action: (enabled: boolean) => Promise<void>;
};

/**
 * One-tap toggle for the Strava verdict line. No arming step: the write
 * is reversible (turn it off and the next debrief simply stops posting),
 * and the consequence is spelled out in the copy directly above the
 * button, so a confirm prompt would just be friction.
 */
export function StravaBlurbToggle({ enabled, action }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await action(!enabled);
        })
      }
      className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150 disabled:opacity-60"
    >
      {pending
        ? "Saving…"
        : enabled
          ? "Turn off Strava verdicts"
          : "Turn on Strava verdicts"}
    </button>
  );
}
