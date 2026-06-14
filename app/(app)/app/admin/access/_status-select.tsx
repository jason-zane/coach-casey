"use client";

import { useTransition } from "react";
import { setAccessRequestStatus } from "@/app/actions/admin";
import type { AccessRequestStatus } from "@/lib/admin/access-requests";

const STATUSES: AccessRequestStatus[] = [
  "pending",
  "invited",
  "joined",
  "declined",
];

export function StatusSelect({
  id,
  status,
}: {
  id: string;
  status: AccessRequestStatus;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={status}
      disabled={pending}
      aria-label="Request status"
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          const fd = new FormData();
          fd.set("id", id);
          fd.set("status", next);
          await setAccessRequestStatus(fd);
        });
      }}
      className="rounded-md border border-rule bg-surface px-2 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink outline-none transition-colors hover:border-rule-strong focus:border-accent disabled:opacity-50"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
