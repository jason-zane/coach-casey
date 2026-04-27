"use client";

import Link from "next/link";
import { useRef, useState } from "react";

type Props = {
  onOpenCalendar: () => void;
  onOpenSearch: () => void;
};

const HINT_KEY = "coach-casey:menu-hint-counts:v1";
const HINT_MAX = 3;

type HintCounts = { calendar: number; search: number };

function readHintCounts(): HintCounts {
  if (typeof window === "undefined") return { calendar: 0, search: 0 };
  try {
    const raw = window.localStorage.getItem(HINT_KEY);
    if (!raw) return { calendar: 0, search: 0 };
    const parsed = JSON.parse(raw) as Partial<HintCounts>;
    return {
      calendar: typeof parsed.calendar === "number" ? parsed.calendar : 0,
      search: typeof parsed.search === "number" ? parsed.search : 0,
    };
  } catch {
    return { calendar: 0, search: 0 };
  }
}

function writeHintCounts(counts: HintCounts) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HINT_KEY, JSON.stringify(counts));
  } catch {
    // no-op
  }
}

function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect
        x="3"
        y="4.5"
        width="14"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M3 8h14" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 3v3M13 3v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M13.5 13.5l3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconAthlete() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4 17c0-3 2.7-5 6-5s6 2 6 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HintArrow({ direction }: { direction: "left" | "right" }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-accent/70 ${
        direction === "left"
          ? "hint-drift-left -left-1"
          : "hint-drift-right -right-1"
      }`}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        {direction === "left" ? (
          <path
            d="M7 2L3 5l4 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M3 2l4 3-4 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
  );
}

export function MenuBar({ onOpenCalendar, onOpenSearch }: Props) {
  const [hintCounts, setHintCounts] = useState<HintCounts>({
    calendar: 0,
    search: 0,
  });
  const hydratedRef = useRef(false);

  function ensureHydrated(): HintCounts {
    if (hydratedRef.current) return hintCounts;
    hydratedRef.current = true;
    const fromStore = readHintCounts();
    setHintCounts(fromStore);
    return fromStore;
  }

  function handleCalendar() {
    const base = ensureHydrated();
    const next = { ...base, calendar: base.calendar + 1 };
    setHintCounts(next);
    writeHintCounts(next);
    onOpenCalendar();
  }

  function handleSearch() {
    const base = ensureHydrated();
    const next = { ...base, search: base.search + 1 };
    setHintCounts(next);
    writeHintCounts(next);
    onOpenSearch();
  }

  return (
    <nav
      aria-label="Thread controls"
      className="sm:hidden flex items-center justify-around px-2 py-2 border-t border-rule/60 bg-paper"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
    >
      <button
        type="button"
        onClick={handleCalendar}
        aria-label="Calendar"
        className="relative h-11 w-11 grid place-items-center text-ink-muted"
      >
        <IconCalendar />
        {hintCounts.calendar < HINT_MAX && <HintArrow direction="left" />}
      </button>
      <button
        type="button"
        onClick={handleSearch}
        aria-label="Search"
        className="relative h-11 w-11 grid place-items-center text-ink-muted"
      >
        <IconSearch />
        {hintCounts.search < HINT_MAX && <HintArrow direction="right" />}
      </button>
      <Link
        href="/app/athlete"
        aria-label="Athlete page"
        className="h-11 w-11 grid place-items-center text-ink-muted"
      >
        <IconAthlete />
      </Link>
    </nav>
  );
}

export function DesktopControls({ onOpenCalendar, onOpenSearch }: Props) {
  return (
    <div className="hidden sm:flex items-center gap-1">
      <button
        type="button"
        onClick={onOpenCalendar}
        aria-label="Calendar"
        title="Calendar (⌘D)"
        className="h-9 w-9 grid place-items-center text-ink-muted hover:text-ink rounded-sm"
      >
        <IconCalendar />
      </button>
      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Search"
        title="Search (⌘K)"
        className="h-9 w-9 grid place-items-center text-ink-muted hover:text-ink rounded-sm"
      >
        <IconSearch />
      </button>
      <Link
        href="/app/athlete"
        aria-label="Athlete page"
        title="Athlete page"
        className="h-9 w-9 grid place-items-center text-ink-muted hover:text-ink rounded-sm"
      >
        <IconAthlete />
      </Link>
    </div>
  );
}
