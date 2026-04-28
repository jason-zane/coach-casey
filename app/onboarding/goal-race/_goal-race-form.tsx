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

export function GoalRaceForm() {
  const [name, setName] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [goalTime, setGoalTime] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("race_date", raceDate);
      fd.set("goal_time", goalTime);
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
