"use client";

import { useRef, useState, useTransition } from "react";
import { saveInjury, skipInjury } from "@/app/actions/injury";

const CHIPS = [
  "calf",
  "Achilles",
  "knee",
  "hip",
  "plantar",
  "shin",
  "hamstring",
  "ITB",
  "back",
];

export function InjuryForm() {
  const [text, setText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function addChip(label: string) {
    if (!tags.includes(label)) setTags((t) => [...t, label]);
    const prefix = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
    const insertion = `${prefix}${label}: `;
    setText(text + insertion);
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.focus();
        const end = ref.current.value.length;
        ref.current.setSelectionRange(end, end);
      }
    });
  }

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("injury_text", text);
      fd.set("injury_tags", tags.join(","));
      await saveInjury(fd);
    });
  }

  function skip() {
    startTransition(async () => {
      await skipInjury();
    });
  }

  return (
    <div className="space-y-5">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="Nothing right now, or something like: tight right calf since last Sunday's long run, easing off it but not stopping."
        className="w-full rounded-md border border-rule bg-surface px-3 py-3 font-sans text-sm text-ink placeholder:text-ink-subtle outline-none transition-colors focus:border-accent"
      />

      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
          Common spots
        </p>
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => addChip(c)}
              className={`rounded-full border px-3.5 py-1.5 font-sans text-sm transition-colors ${
                tags.includes(c)
                  ? "border-accent bg-accent/10 text-ink"
                  : "border-rule text-ink hover:border-rule-strong"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={skip}
          disabled={pending}
          className="font-sans text-sm text-ink-muted underline-offset-4 hover:underline"
        >
          Nothing to report
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-accent px-5 py-2.5 font-sans text-sm text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving\u2026" : "Continue"}
        </button>
      </div>
    </div>
  );
}
