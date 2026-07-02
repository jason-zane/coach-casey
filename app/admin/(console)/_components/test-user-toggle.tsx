"use client";

import { useTransition } from "react";
import { toggleTestUser } from "@/app/actions/admin";

export function TestUserToggle({
  athleteId,
  isTestUser,
}: {
  athleteId: string;
  isTestUser: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function flip() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("athlete_id", athleteId);
      fd.set("target", String(!isTestUser));
      await toggleTestUser(fd);
    });
  }

  return (
    <button
      type="button"
      onClick={flip}
      disabled={pending}
      className={`rounded-md border px-2 py-1 text-[11px] font-mono uppercase tracking-[0.14em] transition-colors duration-150 ${
        isTestUser
          ? "border-accent bg-accent/10 text-ink"
          : "border-rule text-ink-subtle hover:text-ink hover:border-rule-strong"
      } disabled:opacity-50`}
      aria-pressed={isTestUser}
    >
      {pending ? "…" : isTestUser ? "test" : "set test"}
    </button>
  );
}
