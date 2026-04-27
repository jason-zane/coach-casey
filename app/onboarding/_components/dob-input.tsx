"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (iso: string) => void;
  id?: string;
};

const FIELD =
  "rounded-md border border-rule bg-surface px-2.5 py-2.5 font-sans text-base text-ink placeholder:text-ink-subtle outline-none transition-colors focus:border-accent text-center tabular-nums";

function isoFromParts(d: string, m: string, y: string): string {
  if (d.length !== 2 || m.length !== 2 || y.length !== 4) return "";
  const yi = Number(y);
  const mi = Number(m);
  const di = Number(d);
  if (
    !Number.isFinite(yi) ||
    !Number.isFinite(mi) ||
    !Number.isFinite(di) ||
    mi < 1 ||
    mi > 12 ||
    di < 1 ||
    di > 31 ||
    yi < 1900 ||
    yi > 2100
  ) {
    return "";
  }
  return `${y}-${m}-${d}`;
}

function partsFromIso(iso: string | null): {
  d: string;
  m: string;
  y: string;
} {
  if (!iso) return { d: "", m: "", y: "" };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return { d: "", m: "", y: "" };
  return { y: match[1], m: match[2], d: match[3] };
}

function focusEnd(el: HTMLInputElement | null) {
  if (!el) return;
  el.focus();
  const v = el.value;
  el.setSelectionRange(v.length, v.length);
}

export function DobInput({ value, onChange, id }: Props) {
  const initial = partsFromIso(value);
  const [d, setD] = useState(initial.d);
  const [m, setM] = useState(initial.m);
  const [y, setY] = useState(initial.y);

  const dRef = useRef<HTMLInputElement | null>(null);
  const mRef = useRef<HTMLInputElement | null>(null);
  const yRef = useRef<HTMLInputElement | null>(null);

  // Sync upward whenever the parts change
  useEffect(() => {
    onChange(isoFromParts(d, m, y));
  }, [d, m, y, onChange]);

  return (
    <div className="flex items-center gap-2" id={id}>
      <input
        ref={dRef}
        type="text"
        inputMode="numeric"
        autoComplete="bday-day"
        placeholder="DD"
        aria-label="Day"
        value={d}
        onChange={(e) => {
          const stripped = e.target.value.replace(/\D/g, "").slice(0, 2);
          setD(stripped);
          if (stripped.length === 2) {
            mRef.current?.focus();
            mRef.current?.select();
          }
        }}
        onFocus={(e) => e.currentTarget.select()}
        className={`${FIELD} w-14`}
      />
      <span className="font-sans text-ink-subtle">/</span>
      <input
        ref={mRef}
        type="text"
        inputMode="numeric"
        autoComplete="bday-month"
        placeholder="MM"
        aria-label="Month"
        value={m}
        onChange={(e) => {
          const stripped = e.target.value.replace(/\D/g, "").slice(0, 2);
          setM(stripped);
          if (stripped.length === 2) {
            yRef.current?.focus();
            yRef.current?.select();
          }
        }}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && m.length === 0) {
            focusEnd(dRef.current);
          }
        }}
        className={`${FIELD} w-14`}
      />
      <span className="font-sans text-ink-subtle">/</span>
      <input
        ref={yRef}
        type="text"
        inputMode="numeric"
        autoComplete="bday-year"
        placeholder="YYYY"
        aria-label="Year"
        value={y}
        onChange={(e) => {
          const stripped = e.target.value.replace(/\D/g, "").slice(0, 4);
          setY(stripped);
        }}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && y.length === 0) {
            focusEnd(mRef.current);
          }
        }}
        className={`${FIELD} w-20`}
      />
    </div>
  );
}
