"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (iso: string) => void;
  /** Earliest selectable date (inclusive), ISO yyyy-mm-dd. */
  minIso?: string;
  /** Latest selectable date (inclusive), ISO yyyy-mm-dd. */
  maxIso?: string;
  placeholder?: string;
  id?: string;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseIso(iso: string | null | undefined): {
  year: number;
  month: number;
  day: number;
} | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]) - 1,
    day: Number(m[3]),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Days from Monday to the first of the month. (Mon=0..Sun=6) */
function leadingBlanks(year: number, month: number): number {
  // JS: Sun=0..Sat=6 → shift to Mon=0..Sun=6
  const js = new Date(year, month, 1).getDay();
  return (js + 6) % 7;
}

function formatDisplay(iso: string): string {
  const p = parseIso(iso);
  if (!p) return "";
  const d = new Date(p.year, p.month, p.day);
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function DatePicker({
  value,
  onChange,
  minIso,
  maxIso,
  placeholder = "Pick a date",
  id,
}: Props) {
  const today = new Date();
  const initial = parseIso(value) ?? {
    year: today.getFullYear(),
    month: today.getMonth(),
    day: today.getDate(),
  };

  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const min = parseIso(minIso ?? null);
  const max = parseIso(maxIso ?? null);
  const minDate = min ? new Date(min.year, min.month, min.day) : null;
  const maxDate = max ? new Date(max.year, max.month, max.day) : null;

  function isOutOfRange(y: number, m: number, d: number): boolean {
    const dt = new Date(y, m, d);
    if (minDate && dt < minDate) return true;
    if (maxDate && dt > maxDate) return true;
    return false;
  }

  function pickDay(d: number) {
    if (isOutOfRange(year, month, d)) return;
    onChange(toIso(year, month, d));
    setOpen(false);
  }

  function step(delta: number) {
    let m = month + delta;
    let y = year;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  }

  // Year range for the dropdown — sensible window around current
  const yearRange: number[] = [];
  const startYear = today.getFullYear() - 1;
  const endYear = today.getFullYear() + 5;
  for (let yy = startYear; yy <= endYear; yy++) yearRange.push(yy);

  const blanks = leadingBlanks(year, month);
  const total = daysInMonth(year, month);
  const cells: (number | null)[] = [];
  for (let i = 0; i < blanks; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);

  const selected = parseIso(value);
  const display = value ? formatDisplay(value) : "";

  return (
    <div className="relative" ref={wrapRef}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-md border border-rule bg-surface px-3 py-2.5 font-sans text-sm text-left outline-none transition-colors focus:border-accent flex items-center justify-between gap-2"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={display ? "text-ink" : "text-ink-subtle"}>
          {display || placeholder}
        </span>
        <svg
          className="h-4 w-4 text-ink-subtle"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
        >
          <rect
            x="3"
            y="4"
            width="14"
            height="13"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M3 8h14M7 2v4M13 2v4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose date"
          className="absolute left-0 right-0 z-20 mt-2 rounded-md border border-rule bg-paper p-3 shadow-md"
        >
          <div className="flex items-center justify-between gap-2 pb-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous month"
              className="rounded px-2 py-1 text-ink-muted hover:bg-surface"
            >
              ‹
            </button>
            <div className="flex items-center gap-1.5">
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                aria-label="Month"
                className="rounded border border-rule bg-surface px-2 py-1 font-sans text-sm text-ink"
              >
                {MONTHS.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="Year"
                className="rounded border border-rule bg-surface px-2 py-1 font-sans text-sm text-ink"
              >
                {yearRange.map((yy) => (
                  <option key={yy} value={yy}>
                    {yy}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next month"
              className="rounded px-2 py-1 text-ink-muted hover:bg-surface"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 pb-1">
            {WEEKDAYS.map((w, i) => (
              <div
                key={i}
                className="text-center font-mono text-[10px] uppercase tracking-wider text-ink-subtle py-1"
              >
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={`b-${i}`} />;
              const isSelected =
                selected &&
                selected.year === year &&
                selected.month === month &&
                selected.day === d;
              const isToday =
                today.getFullYear() === year &&
                today.getMonth() === month &&
                today.getDate() === d;
              const disabled = isOutOfRange(year, month, d);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  onClick={() => pickDay(d)}
                  aria-pressed={isSelected ? true : undefined}
                  className={`h-9 rounded font-sans text-sm transition-colors ${
                    isSelected
                      ? "bg-accent text-accent-ink"
                      : disabled
                        ? "text-ink-subtle/40 cursor-not-allowed"
                        : isToday
                          ? "border border-rule text-ink hover:border-rule-strong"
                          : "text-ink hover:bg-surface"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
