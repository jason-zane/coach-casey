"use client";

import { useState, useTransition } from "react";

type Props = {
  action: () => Promise<void>;
};

/**
 * Two-tap disconnect per design principles. First tap reveals the
 * confirmation prompt with the consequence stated in plain language;
 * second tap commits.
 */
export function DisconnectStravaButton({ action }: Props) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
      >
        Disconnect Strava
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] leading-[1.55] text-ink">
        Disconnect Strava? Coach Casey won&apos;t read new runs until you
        reconnect.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await action();
            })
          }
          className="inline-flex items-center h-9 px-3 rounded-[6px] bg-ink text-paper text-[13px] font-medium hover:opacity-90 transition-opacity duration-150 disabled:opacity-60"
        >
          {pending ? "Disconnecting…" : "Yes, disconnect"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setArmed(false)}
          className="inline-flex items-center h-9 px-3 rounded-[6px] text-ink-muted text-[13px] hover:text-ink transition-colors duration-150"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
