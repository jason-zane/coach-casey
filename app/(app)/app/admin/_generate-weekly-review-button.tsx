"use client";

import { useState, useTransition } from "react";
import { adminGenerateWeeklyReview } from "@/app/actions/admin";

export function GenerateWeeklyReviewButton({
  athleteId,
}: {
  athleteId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<string | null>(null);

  function fire(force: boolean) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("athlete_id", athleteId);
      if (force) fd.set("force", "1");
      try {
        await adminGenerateWeeklyReview(fd);
        setLast(force ? "regenerated" : "fired");
      } catch (e) {
        setLast(`error: ${e instanceof Error ? e.message : "unknown"}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => fire(false)}
          disabled={pending}
          className="rounded-md border border-rule px-2 py-1 text-[11px] font-mono uppercase tracking-[0.14em] text-ink-subtle hover:text-ink hover:border-rule-strong disabled:opacity-50"
          title="Generate weekly review for previous full week (idempotent)"
        >
          {pending ? "…" : "review"}
        </button>
        <button
          type="button"
          onClick={() => fire(true)}
          disabled={pending}
          className="rounded-md border border-rule px-2 py-1 text-[11px] font-mono uppercase tracking-[0.14em] text-ink-subtle hover:text-ink hover:border-rule-strong disabled:opacity-50"
          title="Force-regenerate (replaces existing review for the same week)"
        >
          force
        </button>
      </div>
      {last && (
        <span className="text-[10px] text-ink-subtle">{last}</span>
      )}
    </div>
  );
}
