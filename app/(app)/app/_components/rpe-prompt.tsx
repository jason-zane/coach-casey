"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  markRpePromptShown,
  skipRpePrompt,
  submitRpeValue,
} from "@/app/actions/rpe";
import type { DebriefRpeMeta, RpeState } from "@/lib/rpe/types";
import { RPE_MAX, RPE_MIN } from "@/lib/rpe/types";

type Props = {
  activityId: string;
  initial: DebriefRpeMeta;
};

/**
 * Anchor descriptors for positions 1, 3, 5, 7, 10 per spec §4. These are
 * v1 placeholders and will be replaced by the content workstream at
 * launch-prep — leaving them in a single map so the swap is one edit.
 */
const ANCHOR_DESCRIPTORS: Record<number, string> = {
  1: "very easy",
  3: "steady",
  5: "somewhat hard",
  7: "very hard",
  10: "max effort",
};

const VALUES = Array.from({ length: RPE_MAX - RPE_MIN + 1 }, (_, i) => i + RPE_MIN);

function descriptorFor(value: number | null): string | null {
  if (value === null) return null;
  // For non-anchor numbers, surface the nearest anchor in parentheses
  // form so an answered "8" still reads alongside something the athlete
  // recognises.
  if (ANCHOR_DESCRIPTORS[value]) return ANCHOR_DESCRIPTORS[value];
  let nearest = 1;
  let best = Infinity;
  for (const k of Object.keys(ANCHOR_DESCRIPTORS).map(Number)) {
    const d = Math.abs(k - value);
    if (d < best) {
      best = d;
      nearest = k;
    }
  }
  return ANCHOR_DESCRIPTORS[nearest];
}

export function RpePrompt({ activityId, initial }: Props) {
  const [state, setState] = useState<RpeState>(initial.state);
  const [hovered, setHovered] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const promptedRef = useRef(false);

  // Mark the prompt as shown once, on first visibility. Server is
  // idempotent — re-firing on remount is harmless. IntersectionObserver
  // covers the case where the debrief is mounted but offscreen (long
  // thread); falling back to immediate fire if the API isn't available.
  useEffect(() => {
    if (promptedRef.current) return;
    if (initial.state.kind !== "unanswered") return;
    if (!initial.eligible) return;

    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      promptedRef.current = true;
      void markRpePromptShown(activityId);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !promptedRef.current) {
            promptedRef.current = true;
            void markRpePromptShown(activityId);
            obs.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [activityId, initial.state.kind, initial.eligible]);

  if (!initial.eligible && initial.state.kind === "unanswered") return null;

  function pick(value: number) {
    if (state.kind !== "unanswered") return;
    // Optimistic — interaction-principles §3.4. Server reconciles in the
    // background; on failure we revert to unanswered and surface a hint.
    const previous = state;
    const optimistic: RpeState = {
      kind: "answered",
      value,
      answeredAt: new Date().toISOString(),
    };
    setState(optimistic);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(8);
      } catch {
        // no-op
      }
    }
    startTransition(async () => {
      try {
        const result = await submitRpeValue(activityId, value);
        setState(result.state);
      } catch (e) {
        console.warn("rpe submit failed", e);
        setState(previous);
      }
    });
  }

  function skip() {
    if (state.kind !== "unanswered") return;
    const previous = state;
    const optimistic: RpeState = {
      kind: "skipped",
      skippedAt: new Date().toISOString(),
    };
    setState(optimistic);
    startTransition(async () => {
      try {
        const result = await skipRpePrompt(activityId);
        setState(result.state);
      } catch (e) {
        console.warn("rpe skip failed", e);
        setState(previous);
      }
    });
  }

  if (state.kind === "skipped") {
    // Quiet, non-interactive trail — keeps the debrief layout stable
    // without re-offering a control the spec disallows in V1.
    return (
      <div
        ref={containerRef}
        className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle"
        aria-label="RPE skipped"
      >
        RPE <span className="text-ink-subtle">·</span> skipped
      </div>
    );
  }

  if (state.kind === "answered") {
    const desc = descriptorFor(state.value);
    return (
      <div
        ref={containerRef}
        className="flex items-baseline gap-2"
        aria-label={`RPE ${state.value} of 10${desc ? `, ${desc}` : ""}`}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          RPE
        </span>
        <span className="font-serif text-[22px] leading-none text-ink tabular-nums">
          {state.value}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
          / 10
        </span>
        {desc && (
          <span className="font-serif italic text-[14px] text-ink-muted">{desc}</span>
        )}
      </div>
    );
  }

  // Unanswered.
  const previewValue = hovered ?? null;
  const previewDesc = descriptorFor(previewValue);

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Rate of perceived exertion, 1 to 10"
      className="space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
            RPE
          </span>
          <span className="font-serif italic text-[14px] text-ink-muted">
            How hard did that feel?
          </span>
        </div>
        <button
          type="button"
          onClick={skip}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle hover:text-ink-muted underline-offset-4 hover:underline"
          aria-label="Skip RPE prompt"
        >
          Skip
        </button>
      </div>

      <div
        role="radiogroup"
        aria-label="Effort, 1 to 10"
        className="flex w-full justify-between gap-1 sm:gap-1.5"
      >
        {VALUES.map((v) => {
          const isAnchor = ANCHOR_DESCRIPTORS[v] !== undefined;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={false}
              aria-label={`${v}${ANCHOR_DESCRIPTORS[v] ? `, ${ANCHOR_DESCRIPTORS[v]}` : ""}`}
              onPointerEnter={() => setHovered(v)}
              onPointerLeave={() => setHovered((h) => (h === v ? null : h))}
              onFocus={() => setHovered(v)}
              onBlur={() => setHovered((h) => (h === v ? null : h))}
              onClick={() => pick(v)}
              className={
                "flex-1 min-w-0 aspect-square rounded-full border font-serif text-[16px] sm:text-[17px] tabular-nums leading-none grid place-items-center transition-colors " +
                (isAnchor
                  ? "border-rule-strong text-ink"
                  : "border-rule text-ink-muted") +
                " hover:border-accent/70 hover:text-ink focus-visible:border-accent focus-visible:text-ink"
              }
            >
              {v}
            </button>
          );
        })}
      </div>

      {/* Anchor descriptor strip — shown at first use per spec §4. Each
          label sits beneath its number; non-anchors are an empty cell so
          alignment stays honest. Hover/focus over the picker swaps the
          line for the focused number's descriptor. */}
      <div className="space-y-1">
        <div className="flex w-full justify-between gap-1 sm:gap-1.5" aria-hidden>
          {VALUES.map((v) => (
            <div key={v} className="flex-1 min-w-0 text-center">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-subtle">
                {ANCHOR_DESCRIPTORS[v] ?? ""}
              </span>
            </div>
          ))}
        </div>
        <div
          className="font-serif italic text-[13px] text-ink-muted text-center min-h-[1.25em]"
          aria-live="polite"
        >
          {previewDesc && previewValue !== null
            ? `${previewValue} · ${previewDesc}`
            : ""}
        </div>
      </div>
    </div>
  );
}
