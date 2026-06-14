"use client";

import { useActionState, useEffect, useRef } from "react";

/**
 * Shared composer for the coach<->athlete channel. Drives a server action
 * (admin send, or athlete reply), clears on success, and shows a pending
 * state. The action takes the FormData; any return value is ignored.
 */
export function CoachComposer({
  action,
  athleteId,
  placeholder,
}: {
  action: (formData: FormData) => Promise<unknown>;
  athleteId?: string;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [count, submit, pending] = useActionState(
    async (prev: number, formData: FormData) => {
      await action(formData);
      return prev + 1;
    },
    0,
  );

  useEffect(() => {
    if (count > 0 && ref.current) ref.current.value = "";
  }, [count]);

  return (
    <form action={submit} className="flex flex-col gap-2">
      {athleteId ? (
        <input type="hidden" name="athlete_id" value={athleteId} />
      ) : null}
      <textarea
        ref={ref}
        name="body"
        required
        rows={3}
        placeholder={placeholder}
        className="w-full resize-y rounded-md border border-rule bg-surface px-3 py-2.5 font-sans text-[14px] leading-[1.5] text-ink outline-none transition-colors focus:border-accent"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 font-sans text-[14px] text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
