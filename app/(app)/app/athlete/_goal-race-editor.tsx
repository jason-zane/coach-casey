"use client";

import { useState, useTransition } from "react";
import {
  clearGoalRace,
  saveGoalRace,
  type GoalRaceInput,
} from "@/app/actions/athlete-edits";

type Props = {
  initial: {
    name: string | null;
    raceDate: string | null;
    goalTimeSeconds: number | null;
  } | null;
};

function secondsToHms(s: number | null): {
  hours: string;
  minutes: string;
  seconds: string;
} {
  if (s == null || s <= 0) return { hours: "", minutes: "", seconds: "" };
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return {
    hours: h > 0 ? String(h) : "",
    minutes: String(m),
    seconds: String(sec),
  };
}

function hmsToSeconds(
  hours: string,
  minutes: string,
  seconds: string,
): number | null {
  const h = Number(hours) || 0;
  const m = Number(minutes) || 0;
  const s = Number(seconds) || 0;
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

function formatGoalTime(s: number | null): string | null {
  if (s == null || s <= 0) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function GoalRaceEditor({ initial }: Props) {
  const [editing, setEditing] = useState(initial == null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [date, setDate] = useState(initial?.raceDate ?? "");
  const initialHms = secondsToHms(initial?.goalTimeSeconds ?? null);
  const [hours, setHours] = useState(initialHms.hours);
  const [minutes, setMinutes] = useState(initialHms.minutes);
  const [seconds, setSeconds] = useState(initialHms.seconds);

  function reset(toInitial: boolean) {
    setError(null);
    if (toInitial) {
      setName(initial?.name ?? "");
      setDate(initial?.raceDate ?? "");
      const hms = secondsToHms(initial?.goalTimeSeconds ?? null);
      setHours(hms.hours);
      setMinutes(hms.minutes);
      setSeconds(hms.seconds);
    } else {
      setName("");
      setDate("");
      setHours("");
      setMinutes("");
      setSeconds("");
    }
  }

  function handleSave() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Add a race name.");
      return;
    }
    const input: GoalRaceInput = {
      name: trimmed,
      raceDate: date || null,
      goalTimeSeconds: hmsToSeconds(hours, minutes, seconds),
    };
    startTransition(async () => {
      try {
        await saveGoalRace(input);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save");
      }
    });
  }

  function handleClear() {
    startTransition(async () => {
      try {
        await clearGoalRace();
        reset(false);
        setEditing(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't clear");
      }
    });
  }

  if (!editing && initial) {
    const goalTimeLabel = formatGoalTime(initial.goalTimeSeconds);
    const dateLabel = initial.raceDate
      ? new Date(initial.raceDate).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;
    return (
      <div className="space-y-3">
        <div className="space-y-1 text-[14px]">
          <div className="text-ink font-medium">{initial.name}</div>
          <div className="text-ink-muted">
            {dateLabel ?? "No date set"}
            {goalTimeLabel ? ` · target ${goalTimeLabel}` : ""}
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={pending}
            className="inline-flex items-center h-9 px-3 rounded-[6px] text-ink-muted text-[13px] hover:text-ink transition-colors duration-150"
          >
            {pending ? "Clearing…" : "Clear"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!initial && (
        <p className="text-[13px] leading-[1.55] text-ink-muted">
          The race that matters and what time you&rsquo;re chasing. Casey
          uses this everywhere, debriefs, weekly reviews, the lot.
        </p>
      )}

      <label className="block space-y-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
          Race
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Melbourne Marathon"
          className="block w-full bg-paper border border-rule rounded-[6px] px-3 h-9 text-[14px] text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent/60"
          disabled={pending}
        />
      </label>

      <label className="block space-y-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
          Date
        </span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="block w-full bg-paper border border-rule rounded-[6px] px-3 h-9 text-[14px] text-ink focus:outline-none focus:border-accent/60"
          disabled={pending}
        />
      </label>

      <fieldset className="space-y-1">
        <legend className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
          Target time
        </legend>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={9}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="h"
            className="w-14 bg-paper border border-rule rounded-[6px] px-2 h-9 text-[14px] text-ink text-center focus:outline-none focus:border-accent/60"
            disabled={pending}
          />
          <span className="text-ink-subtle">:</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="mm"
            className="w-14 bg-paper border border-rule rounded-[6px] px-2 h-9 text-[14px] text-ink text-center focus:outline-none focus:border-accent/60"
            disabled={pending}
          />
          <span className="text-ink-subtle">:</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            placeholder="ss"
            className="w-14 bg-paper border border-rule rounded-[6px] px-2 h-9 text-[14px] text-ink text-center focus:outline-none focus:border-accent/60"
            disabled={pending}
          />
        </div>
      </fieldset>

      {error && (
        <p className="text-[13px] text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="inline-flex items-center h-9 px-3 rounded-[6px] bg-ink text-paper text-[13px] font-medium hover:opacity-90 transition-opacity duration-150 disabled:opacity-60"
        >
          {pending ? "Saving…" : initial ? "Save" : "Add goal race"}
        </button>
        {initial && (
          <button
            type="button"
            onClick={() => {
              reset(true);
              setEditing(false);
            }}
            disabled={pending}
            className="inline-flex items-center h-9 px-3 rounded-[6px] text-ink-muted text-[13px] hover:text-ink transition-colors duration-150"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
