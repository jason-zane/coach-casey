"use client";

import { useCallback, useState, useTransition } from "react";
import { saveAboutYou } from "@/app/actions/about-you";
import {
  FieldLabel,
  Input,
  PrimaryButton,
  StepFooter,
} from "@/app/onboarding/_components/form";
import { DobInput } from "@/app/onboarding/_components/dob-input";

type Sex = "M" | "F" | "X";

type Props = {
  initialName: string | null;
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
  name: "Please enter a name.",
  dob: "Please enter a valid date of birth.",
  sex: "Please select an option.",
  weight: "Weight should be between 20 and 250 kg.",
};

export function AboutYouForm({
  initialName,
  initialSex,
  initialWeightKg,
  initialDob,
  backfill,
  error,
}: Props) {
  const [name, setName] = useState<string>(initialName ?? "");
  const [sex, setSex] = useState<Sex | "">(initialSex ?? "");
  const [weightKg, setWeightKg] = useState<string>(
    initialWeightKg != null ? String(initialWeightKg) : "",
  );
  const [dob, setDob] = useState<string>(initialDob ?? "");
  const [pending, startTransition] = useTransition();
  const handleDobChange = useCallback((iso: string) => setDob(iso), []);

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("display_name", name);
      fd.set("date_of_birth", dob);
      fd.set("sex", sex);
      fd.set("weight_kg", weightKg);
      if (backfill) fd.set("backfill", "1");
      await saveAboutYou(fd);
    });
  }

  const canSubmit =
    name.trim().length > 0 &&
    dob &&
    (sex === "M" || sex === "F" || sex === "X") &&
    !pending;

  return (
    <div className="space-y-7">
      {error && ERROR_TEXT[error] && (
        <div className="rounded-md border border-rule bg-surface px-3 py-2 font-sans text-sm text-ink">
          {ERROR_TEXT[error]}
        </div>
      )}

      <div className="space-y-2">
        <FieldLabel
          htmlFor="display_name"
          hint={initialName ? "· pulled from Strava, edit if needed" : undefined}
        >
          What should I call you?
        </FieldLabel>
        <Input
          id="display_name"
          type="text"
          autoComplete="given-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jason"
          maxLength={60}
        />
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="dob">Date of birth</FieldLabel>
        <DobInput id="dob" value={dob} onChange={handleDobChange} />
      </div>

      <div className="space-y-2">
        <p className="font-sans text-sm text-ink-muted">
          Sex
          {initialSex && (
            <span className="ml-2 text-ink-subtle">
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
              className={`flex-1 rounded-md border px-4 py-2.5 font-sans text-sm transition-colors ${
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
        <FieldLabel htmlFor="weight" hint="· optional">
          Weight (kg)
        </FieldLabel>
        <Input
          id="weight"
          type="number"
          inputMode="decimal"
          step="0.1"
          min="20"
          max="250"
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
          placeholder="e.g. 75"
        />
      </div>

      <StepFooter>
        <span />
        <PrimaryButton
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          loading={pending}
          loadingLabel="Saving…"
        >
          Continue
        </PrimaryButton>
      </StepFooter>
    </div>
  );
}
