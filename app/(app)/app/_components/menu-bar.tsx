"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions/auth";

type Props = {
  onOpenCalendar: () => void;
  onOpenSearch: () => void;
};

function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="3" y="4.5" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13.5 13.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="4.5" cy="10" r="1.3" fill="currentColor" />
      <circle cx="10" cy="10" r="1.3" fill="currentColor" />
      <circle cx="15.5" cy="10" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function MenuBar({ onOpenCalendar, onOpenSearch }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  return (
    <nav
      aria-label="Thread controls"
      className="sm:hidden flex items-center justify-around px-2 py-2 border-t border-rule/60 bg-paper"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
    >
      <button
        type="button"
        onClick={onOpenCalendar}
        aria-label="Calendar"
        className="h-11 w-11 grid place-items-center text-ink-muted"
      >
        <IconCalendar />
      </button>
      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Search"
        className="h-11 w-11 grid place-items-center text-ink-muted"
      >
        <IconSearch />
      </button>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="h-11 w-11 grid place-items-center text-ink-muted"
        >
          <IconMenu />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 bottom-12 w-48 bg-surface border border-rule rounded-md shadow-lg py-1 text-[14px]"
          >
            <form action={signOut}>
              <button
                type="submit"
                role="menuitem"
                className="w-full text-left px-3 py-2 hover:bg-rule/40 text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </nav>
  );
}

export function DesktopControls({
  onOpenCalendar,
  onOpenSearch,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  return (
    <div className="hidden sm:flex items-center gap-1">
      <button
        type="button"
        onClick={onOpenCalendar}
        aria-label="Calendar"
        className="h-9 w-9 grid place-items-center text-ink-muted hover:text-ink rounded-sm"
      >
        <IconCalendar />
      </button>
      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Search"
        className="h-9 w-9 grid place-items-center text-ink-muted hover:text-ink rounded-sm"
      >
        <IconSearch />
      </button>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="h-9 w-9 grid place-items-center text-ink-muted hover:text-ink rounded-sm"
        >
          <IconMenu />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-10 w-48 bg-surface border border-rule rounded-md shadow-lg py-1 text-[14px] z-10"
          >
            <form action={signOut}>
              <button
                type="submit"
                role="menuitem"
                className="w-full text-left px-3 py-2 hover:bg-rule/40 text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
