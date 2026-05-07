"use client";

import { useState, useTransition } from "react";

type Props = {
  action: () => Promise<void>;
};

/**
 * Two-tap account deletion. Plain-language consequence, irreversible-feeling
 * confirm copy, separate destructive button styling so it's distinct from
 * the disconnect-Strava action above it.
 */
export function DeleteAccountButton({ action }: Props) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] leading-[1.55] text-ink">
        Delete your account? You&apos;ll be signed out immediately and your
        data is permanently removed within 30 days. Strava is disconnected
        as part of this. This can&apos;t be undone after the 30-day window.
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
          className="inline-flex items-center h-9 px-3 rounded-[6px] bg-[#a83232] text-white text-[13px] font-medium hover:opacity-90 transition-opacity duration-150 disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Yes, delete my account"}
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
