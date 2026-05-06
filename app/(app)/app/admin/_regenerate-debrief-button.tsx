"use client";

import { useState, useTransition } from "react";
import { adminRegenerateLatestDebrief } from "@/app/actions/admin";

export function RegenerateDebriefButton({
  athleteId,
}: {
  athleteId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<string | null>(null);

  function fire() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("athlete_id", athleteId);
      try {
        await adminRegenerateLatestDebrief(fd);
        setLast("regenerated");
      } catch (e) {
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
        className="rounded-md border border-rule px-2 py-1 text-[11px] font-mono uppercase tracking-[0.14em] text-ink-subtle hover:text-ink hover:border-rule-strong disabled:opacity-50"
        title="Force-regenerate the debrief or cross-training ack for the athlete's most recent activity"
      >
        {pending ? "…" : "debrief"}
      </button>
      {last && (
        <span className="text-[10px] text-ink-subtle">{last}</span>
      )}
    </div>
  );
}
