"use client";

import { useState, useTransition } from "react";
import { saveAboutYou } from "@/app/actions/about-you";

type Sex = "M" | "F" | "X";

type Props = {
  initialSex: Sex | null;
  initialWeightKg: number | null;
  initialDob: string | null;
  backfill: boolean;
  error: string | null;
};

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "X", label: "Other" },
];

const ERROR_TEXT: Record<string, string> = {
  dob: "Please enter a valid date of birth.",
  sex: "Please select an option.",
  weight: "Weight should be between 20 and 250 kg.",
};

export function AboutYouForm({
  initialSex,
  initialWeightKg,
  initialDob,
  backfill,
  error,
}: Props) {
  const [sex, setSex] = useState<Sex | "">(initialSex ?? "");
  const [weightKg, setWeightKg] = useState<string>(
    initialWeightKg != null ? String(initialWeightKg) : "",
  );
  const [dob, setDob] = useState<string>(initialDob ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("date_of_birth", dob);
      fd.set("sex", sex);
      fd.set("weight_kg", weightKg);
      if (backfill) fd.set("backfill", "1");
      await saveAboutYou(fd);
    });
  }

  const canSubmit =
    dob && (sex === "M" || sex === "F" || sex === "X") && !pending;

  return (
    <div className="space-y-7">
      {error && ERROR_TEXT[error] && (
        <div className="rounded-md border border-rule bg-surface px-3 py-2 font-sans text-sm text-ink">
          {ERROR_TEXT[error]}
        </div>
      )}

      <div className="space-y-2">
        <label
          htmlFor="dob"
          className="font-mono text-xs uppercase tracking-wider text-ink-subtle"
        >
          Date of birth
        </label>
        <input
          id="dob"
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="w-full rounded-md border border-rule bg-surface px-3 py-3 font-sans text-base text-ink outline-none transition-colors focus:border-accent"
        />
      </div>

      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
          Sex
          {initialSex && (
            <span className="ml-2 normal-case tracking-normal text-ink-subtle">
              · pulled from Strava, edit if needed
            </span>
          )}
        </p>
        <div className="flex gap-2">
          {SEX_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSex(opt.value)}
              className={`flex-1 rounded-md border px-4 py-3 font-sans text-sm transition-colors ${
                sex === opt.value
                  ? "border-accent bg-accent/10 text-ink"
                  : "border-rule text-ink hover:border-rule-strong"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="weight"
          className="font-mono text-xs uppercase tracking-wider text-ink-subtle"
        >
          Weight (kg)
          <span className="ml-2 normal-case tracking-normal text-ink-subtle">
            · optional
          </span>
        </label>
        <input
          id="weight"
          type="number"
          inputMode="decimal"
          step="0.1"
          min="20"
          max="250"
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
          placeholder="e.g. 75"
          className="w-full rounded-md border border-rule bg-surface px-3 py-3 font-sans text-base text-ink placeholder:text-ink-subtle outline-none transition-colors focus:border-accent"
        />
      </div>

      <div className="flex items-center justify-end pt-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md bg-accent px-5 py-2.5 font-sans text-sm text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
