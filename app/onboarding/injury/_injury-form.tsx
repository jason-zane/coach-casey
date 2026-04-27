"use client";

import { useRef, useState, useTransition } from "react";
import { saveInjury, skipInjury } from "@/app/actions/injury";
import {
  GhostButton,
  PrimaryButton,
  StepFooter,
  Textarea,
} from "@/app/onboarding/_components/form";

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
      <Textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="Nothing right now, or something like: tight right calf since last Sunday's long run, easing off it but not stopping."
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

      <StepFooter>
        <GhostButton type="button" onClick={skip} disabled={pending}>
          Nothing to report
        </GhostButton>
        <PrimaryButton
          type="button"
          onClick={submit}
          loading={pending}
          loadingLabel="Saving…"
        >
          Continue
        </PrimaryButton>
      </StepFooter>
    </div>
  );
}
