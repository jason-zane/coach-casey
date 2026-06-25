"use client";

import { useState, useTransition } from "react";
import { adminRegenerateLatestDebrief } from "@/app/actions/admin";

/**
 * Force-regenerate the latest debrief / cross-training ack for an athlete.
 * Same server action as the in-app admin, but passes `return_to` so an error
 * lands back on the console route the admin is already looking at instead of
 * bouncing into the mobile app admin.
 */
export function RegenerateDebriefButton({
  athleteId,
  returnTo,
  label = "debrief",
}: {
  athleteId: string;
  returnTo: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<string | null>(null);

  function fire() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("athlete_id", athleteId);
      fd.set("return_to", returnTo);
      try {
        await adminRegenerateLatestDebrief(fd);
        setLast("regenerated");
      } catch (e) {
        // A thrown error here is a real failure (the redirect path handles the
        // pipeline-error case itself); surface a short note.
        setLast(`error: ${e instanceof Error ? e.message : "unknown"}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={fire}
        disabled={pending}
        className="rounded-md border border-rule px-2 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle transition-colors hover:border-rule-strong hover:text-ink disabled:opacity-50"
        title="Force-regenerate the debrief or cross-training ack for the athlete's most recent activity"
      >
        {pending ? "…" : label}
      </button>
      {last && <span className="text-[10px] text-ink-subtle">{last}</span>}
    </div>
  );
}
