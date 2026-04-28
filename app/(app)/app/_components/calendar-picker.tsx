"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { fetchCalendarDates } from "@/app/actions/thread";
import { BottomSheet } from "./bottom-sheet";

type Props = {
  threadId: string;
  open: boolean;
  onClose: () => void;
  onPick: (isoDate: string) => void;
};

type PickerMode = "days" | "months" | "years";

function monthName(year: number, month: number) {
  return new Intl.DateTimeFormat(undefined, { month: "long" }).format(
    new Date(year, month - 1, 1),
  );
}

function shortMonthName(month: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short" }).format(
    new Date(2000, month - 1, 1),
  );
}

function buildGrid(year: number, month: number): Array<string | null> {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const firstDow = (first.getDay() + 6) % 7;
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) {
    const mm = String(month).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push(`${year}-${mm}-${dd}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function CalendarPicker({ threadId, open, onClose, onPick }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PickerMode>("days");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || mode !== "days") return;
    startTransition(async () => {
      const dates = await fetchCalendarDates(threadId, year, month);
      setMarked(new Set(dates));
    });
  }, [open, threadId, year, month, mode]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (mode !== "days") setMode("days");
        else onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, mode]);

  const cells = useMemo(() => buildGrid(year, month), [year, month]);
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  function prev() {
    const d = new Date(year, month - 2, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }
  function next() {
    const d = new Date(year, month, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  const thisYear = today.getFullYear();
  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = thisYear + 2; y >= thisYear - 10; y--) out.push(y);
    return out;
  }, [thisYear]);

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="Calendar">
      <div className="flex flex-col pt-4 pb-4">
        <div className="flex items-center justify-between px-5 mb-4">
          <button
            type="button"
            onClick={prev}
            aria-label="Previous month"
            disabled={mode !== "days"}
            className="h-9 w-9 grid place-items-center text-ink-muted hover:text-ink disabled:opacity-30"
          >
            ‹
          </button>
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              onClick={() => setMode(mode === "months" ? "days" : "months")}
              className="font-serif text-[17px] text-ink hover:text-accent underline-offset-4 hover:underline"
              suppressHydrationWarning
            >
              {monthName(year, month)}
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "years" ? "days" : "years")}
              className="font-mono text-[13px] text-ink-muted hover:text-accent underline-offset-4 hover:underline"
              suppressHydrationWarning
            >
              {year}
            </button>
          </div>
          <button
            type="button"
            onClick={next}
            aria-label="Next month"
            disabled={mode !== "days"}
            className="h-9 w-9 grid place-items-center text-ink-muted hover:text-ink disabled:opacity-30"
          >
            ›
          </button>
        </div>

        {mode === "days" && (
          <>
            <div className="px-5 grid grid-cols-7 gap-1 text-center font-mono text-[10px] uppercase tracking-wider text-ink-subtle mb-2">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div
              className={`px-5 grid grid-cols-7 gap-1 ${pending ? "opacity-60" : ""}`}
            >
              {cells.map((iso, i) => {
                if (!iso) return <div key={i} className="aspect-square" />;
                const hasActivity = marked.has(iso);
                const isToday = iso === todayIso;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      onPick(iso);
                      onClose();
                    }}
                    className={`aspect-square rounded-full font-sans text-[13px] grid place-items-center relative transition-colors ${
                      isToday
                        ? "bg-accent/10 text-accent font-medium"
                        : hasActivity
                          ? "text-ink"
                          : "text-ink-muted"
                    } hover:bg-rule/40`}
                    aria-label={`${iso}${hasActivity ? ", has activity" : ""}`}
                  >
                    {Number(iso.slice(8, 10))}
                    {hasActivity && !isToday && (
                      <span
                        aria-hidden
                        className="absolute bottom-[6px] left-1/2 -translate-x-1/2 h-[2px] w-3 rounded-full bg-accent/70"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {mode === "months" && (
          <div className="px-5 grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMonth(m);
                  setMode("days");
                }}
                className={`py-3 rounded-md font-sans text-[14px] ${
                  m === month
                    ? "bg-accent text-accent-ink"
                    : "text-ink hover:bg-rule/40"
                }`}
              >
                {shortMonthName(m)}
              </button>
            ))}
          </div>
        )}

        {mode === "years" && (
          <div className="px-5 grid grid-cols-3 gap-2 overflow-y-auto">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => {
                  setYear(y);
                  setMode("days");
                }}
                className={`py-3 rounded-md font-mono text-[14px] ${
                  y === year
                    ? "bg-accent text-accent-ink"
                    : "text-ink hover:bg-rule/40"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        <div className="px-5 mt-5 pt-4 border-t border-rule/50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="font-sans text-[13px] text-ink-muted underline-offset-4 hover:underline"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              onPick(todayIso);
              onClose();
            }}
            className="font-sans text-[13px] text-accent underline-offset-4 hover:underline"
          >
            Today
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
