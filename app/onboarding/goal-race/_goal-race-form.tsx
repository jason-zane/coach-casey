"use client";

import { useState, useTransition } from "react";
import { saveGoalRace, skipGoalRace } from "@/app/actions/race";
import {
  FieldLabel,
  GhostButton,
  Input,
  PrimaryButton,
  StepFooter,
} from "@/app/onboarding/_components/form";
import { DatePicker } from "@/app/onboarding/_components/date-picker";

type RaceTier = "A" | "B" | "C";

const TIER_OPTIONS: Array<{ value: RaceTier; label: string; description: string }> = [
  {
    value: "A",
    label: "A race",
    description: "Priority race, full taper. Can't train through it.",
  },
  {
    value: "B",
    label: "B race",
    description: "Important. Careful approach, lighter prep window.",
  },
  {
    value: "C",
    label: "C race",
    description: "Train through where the discipline allows. Rare for marathons.",
  },
];

export function GoalRaceForm() {
  const [name, setName] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [goalTime, setGoalTime] = useState("");
  const [tier, setTier] = useState<RaceTier>("B");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("race_date", raceDate);
      fd.set("goal_time", goalTime);
      fd.set("tier", tier);
      await saveGoalRace(fd);
    });
  }

  function skip() {
    startTransition(async () => {
      await skipGoalRace();
    });
  }

  // Earliest selectable: today. Latest: ~2y out, enough for long marathon
  // build cycles without offering decades of empty months.
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const maxDate = new Date(today);
  maxDate.setFullYear(today.getFullYear() + 2);
  const maxIso = `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, "0")}-${String(maxDate.getDate()).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <FieldLabel htmlFor="name">Race</FieldLabel>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="Gold Coast Marathon"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <FieldLabel htmlFor="race_date">Date</FieldLabel>
          <DatePicker
            id="race_date"
            value={raceDate}
            onChange={setRaceDate}
            minIso={todayIso}
            maxIso={maxIso}
            placeholder="Pick a date"
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="goal_time">Goal time</FieldLabel>
          <Input
            id="goal_time"
            name="goal_time"
            type="text"
            placeholder="3:00:00"
            pattern="^\d{1,2}:\d{2}(:\d{2})?$"
            value={goalTime}
            onChange={(e) => setGoalTime(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <FieldLabel htmlFor="tier">Race tier</FieldLabel>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TIER_OPTIONS.map((opt) => {
            const selected = tier === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTier(opt.value)}
                aria-pressed={selected}
                className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                  selected
                    ? "border-foreground bg-foreground/5"
                    : "border-border hover:bg-foreground/[0.02]"
                }`}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="text-muted-foreground text-xs leading-snug">
                  {opt.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <StepFooter>
        <GhostButton type="button" onClick={skip} disabled={pending}>
          Skip for now
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
