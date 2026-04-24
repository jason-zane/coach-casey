"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { fetchCalendarDates } from "@/app/actions/thread";

type Props = {
  threadId: string;
  open: boolean;
  onClose: () => void;
  onPick: (isoDate: string) => void;
};

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
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
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      const dates = await fetchCalendarDates(threadId, year, month);
      setMarked(new Set(dates));
    });
  }, [open, threadId, year, month]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal aria-label="Calendar">
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px] overlay-in"
        onClick={onClose}
      />
      <div
        className="absolute inset-y-0 left-0 w-full sm:w-[380px] bg-paper border-r border-rule slide-in-left flex flex-col"
        style={{
          paddingTop: "calc(1rem + env(safe-area-inset-top))",
          paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex items-center justify-between px-5 mb-4">
          <button
            type="button"
            onClick={prev}
            aria-label="Previous month"
            className="h-9 w-9 grid place-items-center text-ink-muted hover:text-ink"
          >
            ‹
          </button>
          <div className="font-serif text-[17px] text-ink" suppressHydrationWarning>
            {monthLabel(year, month)}
          </div>
          <button
            type="button"
            onClick={next}
            aria-label="Next month"
            className="h-9 w-9 grid place-items-center text-ink-muted hover:text-ink"
          >
            ›
          </button>
        </div>
        <div className="px-5 grid grid-cols-7 gap-1 text-center font-mono text-[10px] uppercase tracking-wider text-ink-subtle mb-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className={`px-5 grid grid-cols-7 gap-1 ${pending ? "opacity-60" : ""}`}>
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
                aria-label={`${iso}${hasActivity ? " — has activity" : ""}`}
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

        <div className="px-5 mt-auto pt-5 flex items-center justify-between">
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
    </div>
  );
}
