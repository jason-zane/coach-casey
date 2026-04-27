"use client";

import { useState, useTransition } from "react";
import { updateAthleteProfile } from "@/app/actions/athlete-edits";

type Props = {
  initial: {
    displayName: string | null;
    units: "metric" | "imperial";
    dateOfBirth: string | null;
    weightKg: number | null;
    sex: string | null;
  };
};

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function formatSex(sex: string | null): string | null {
  if (!sex) return null;
  switch (sex.toUpperCase()) {
    case "M":
      return "Male";
    case "F":
      return "Female";
    case "X":
      return "Other";
    default:
      return sex;
  }
}

function formatWeight(
  weightKg: number | null,
  units: "metric" | "imperial",
): string | null {
  if (weightKg == null) return null;
  if (units === "imperial") {
    const lbs = weightKg * 2.20462;
    return `${lbs.toFixed(0)} lb`;
  }
  return `${weightKg.toFixed(1)} kg`;
}

export function YouEditor({ initial }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<
    null | "displayName" | "units" | "dob" | "weight" | "sex"
  >(null);

  // Mirror the server fields locally so optimistic updates feel instant.
  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [units, setUnits] = useState<"metric" | "imperial">(initial.units);
  const [dob, setDob] = useState(initial.dateOfBirth ?? "");
  const [weightInput, setWeightInput] = useState<string>(
    initial.weightKg != null
      ? initial.units === "imperial"
        ? (initial.weightKg * 2.20462).toFixed(0)
        : initial.weightKg.toFixed(1)
      : "",
  );
  const [sex, setSex] = useState<string>(initial.sex ?? "");

  function close() {
    setOpen(null);
    setError(null);
  }

  function save(
    payload: Parameters<typeof updateAthleteProfile>[0],
    onSuccess?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      try {
        await updateAthleteProfile(payload);
        onSuccess?.();
        setOpen(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save");
      }
    });
  }

  function saveWeight() {
    const raw = weightInput.trim();
    if (raw === "") {
      save({ weightKg: null });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a valid weight.");
      return;
    }
    const kg = units === "imperial" ? n / 2.20462 : n;
    save({ weightKg: kg });
  }

  return (
    <div className="space-y-2">
      <ProfileRow
        label="Name"
        value={displayName || null}
        editing={open === "displayName"}
        onEdit={() => setOpen("displayName")}
        onCancel={close}
        pending={pending}
        renderInput={() => (
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="What should Casey call you?"
            className="block w-full bg-paper border border-rule rounded-[6px] px-3 h-9 text-[14px] text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent/60"
            disabled={pending}
          />
        )}
        onSave={() => save({ displayName: displayName.trim() })}
      />

      <ProfileRow
        label="Units"
        value={units === "imperial" ? "Imperial (mi, lb)" : "Metric (km, kg)"}
        editing={open === "units"}
        onEdit={() => setOpen("units")}
        onCancel={close}
        pending={pending}
        renderInput={() => (
          <div className="flex items-center gap-4 text-[14px]">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="units"
                value="metric"
                checked={units === "metric"}
                onChange={() => setUnits("metric")}
                disabled={pending}
              />
              <span>Metric (km, kg)</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="units"
                value="imperial"
                checked={units === "imperial"}
                onChange={() => setUnits("imperial")}
                disabled={pending}
              />
              <span>Imperial (mi, lb)</span>
            </label>
          </div>
        )}
        onSave={() => save({ units })}
      />

      <ProfileRow
        label="Age"
        value={ageFromDob(dob) != null ? `${ageFromDob(dob)}` : null}
        editing={open === "dob"}
        onEdit={() => setOpen("dob")}
        onCancel={close}
        pending={pending}
        renderInput={() => (
          <div className="space-y-1">
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="block w-full bg-paper border border-rule rounded-[6px] px-3 h-9 text-[14px] text-ink focus:outline-none focus:border-accent/60"
              disabled={pending}
            />
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-subtle">
              Date of birth — Casey shows your age, not the date.
            </p>
          </div>
        )}
        onSave={() => save({ dateOfBirth: dob || null })}
      />

      <ProfileRow
        label="Weight"
        value={formatWeight(initial.weightKg, units)}
        editing={open === "weight"}
        onEdit={() => setOpen("weight")}
        onCancel={close}
        pending={pending}
        renderInput={() => (
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              placeholder={units === "imperial" ? "lb" : "kg"}
              className="w-28 bg-paper border border-rule rounded-[6px] px-3 h-9 text-[14px] text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent/60"
              disabled={pending}
            />
            <span className="text-ink-subtle text-[13px]">
              {units === "imperial" ? "lb" : "kg"}
            </span>
          </div>
        )}
        onSave={saveWeight}
      />

      <ProfileRow
        label="Sex"
        value={formatSex(sex)}
        editing={open === "sex"}
        onEdit={() => setOpen("sex")}
        onCancel={close}
        pending={pending}
        renderInput={() => (
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value)}
            className="block w-full bg-paper border border-rule rounded-[6px] px-3 h-9 text-[14px] text-ink focus:outline-none focus:border-accent/60"
            disabled={pending}
          >
            <option value="">—</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="X">Other</option>
          </select>
        )}
        onSave={() =>
          save({
            sex:
              sex === "M" || sex === "F" || sex === "X" ? sex : null,
          })
        }
      />

      {error && (
        <p className="text-[13px] text-red-700 pt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ProfileRow({
  label,
  value,
  editing,
  onEdit,
  onCancel,
  onSave,
  renderInput,
  pending,
}: {
  label: string;
  value: string | null;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  renderInput: () => React.ReactNode;
  pending: boolean;
}) {
  if (editing) {
    return (
      <div className="space-y-2 py-2">
        <span className="block text-ink-subtle font-mono text-[11px] uppercase tracking-[0.14em]">
          {label}
        </span>
        {renderInput()}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="inline-flex items-center h-8 px-3 rounded-[6px] bg-ink text-paper text-[13px] font-medium hover:opacity-90 transition-opacity duration-150 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex items-center h-8 px-3 rounded-[6px] text-ink-muted text-[13px] hover:text-ink transition-colors duration-150"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <Row label={label}>
      <span className={value ? "text-ink" : "text-ink-subtle"}>
        {value ?? "—"}
      </span>
      <button
        type="button"
        onClick={onEdit}
        className="ml-2 text-[12px] text-ink-muted hover:text-ink transition-colors duration-150"
      >
        Edit
      </button>
    </Row>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px]">
      <span className="text-ink-subtle font-mono text-[11px] uppercase tracking-[0.14em] min-w-[64px]">
        {label}
      </span>
      <span className="flex items-baseline">{children}</span>
    </div>
  );
}
