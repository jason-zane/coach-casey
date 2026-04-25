"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runStravaIngest, type IngestSummary } from "@/app/actions/ingest";
import { advanceFrom } from "@/app/actions/onboarding";

type Phase = "cycling" | "settled" | "error";

const CYCLING_COPY = [
  "Reading your training.",
  "Pulling the last twelve weeks.",
  "Looking at your weeks.",
  "Noting what stands out.",
];

const LINE_INTERVAL_MS = 3200;
const SETTLE_HOLD_MS = 2800;

export function ReadingClient() {
  const [phase, setPhase] = useState<Phase>("cycling");
  const [copyIdx, setCopyIdx] = useState(0);
  const [summary, setSummary] = useState<IngestSummary | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Cycle copy lines until ingest resolves
    const cycle = setInterval(() => {
      setCopyIdx((i) => (i + 1) % CYCLING_COPY.length);
    }, LINE_INTERVAL_MS);

    (async () => {
      const res = await runStravaIngest();
      clearInterval(cycle);
      setSummary(res);
      if (res.status === "error") {
        setPhase("error");
        return;
      }
      setPhase("settled");
    })();

    return () => clearInterval(cycle);
  }, []);

  // After the settled line renders, hold then advance
  useEffect(() => {
    if (phase !== "settled" || !summary) return;
    const t = setTimeout(() => {
      startTransition(() => {
        // advanceFrom writes state + redirects. From "strava" it lands on
        // "validation".
        void advanceFrom("strava");
      });
    }, SETTLE_HOLD_MS);
    return () => clearTimeout(t);
  }, [phase, summary]);

  if (phase === "error") {
    return (
      <div className="w-full space-y-6">
        <p className="font-serif text-2xl leading-snug text-ink">
          Couldn&rsquo;t finish reading.
        </p>
        <p className="font-mono text-xs text-ink-muted break-words">
          {summary?.error ?? "Unknown error."}
        </p>
        <button
          type="button"
          onClick={() => router.push("/onboarding/strava")}
          className="rounded-md border border-rule px-4 py-2 font-sans text-sm text-ink hover:border-rule-strong"
        >
          Back to Strava
        </button>
      </div>
    );
  }

  if (phase === "settled" && summary) {
    return (
      <div className="w-full">
        <SettledLine summary={summary} />
      </div>
    );
  }

  return (
    <div className="w-full">
      <CyclingLine key={copyIdx} text={CYCLING_COPY[copyIdx]} />
    </div>
  );
}

function CyclingLine({ text }: { text: string }) {
  return (
    <p
      className="font-serif text-2xl md:text-3xl leading-snug text-ink rise"
      aria-live="polite"
    >
      {text}
    </p>
  );
}

function SettledLine({ summary }: { summary: IngestSummary }) {
  const { runCount, workoutCount, crossTrainingCount, weeks, status } = summary;
  if (status === "empty") {
    return (
      <p
        className="font-serif text-2xl md:text-3xl leading-snug text-ink rise"
        aria-live="polite"
      >
        Not a lot to read yet. That&rsquo;s fine. I&rsquo;ll get sharper as you
        run.
      </p>
    );
  }
  const workoutClause =
    workoutCount > 0
      ? ` ${workoutCount} ${workoutCount === 1 ? "session" : "sessions"} in there that read like structured work.`
      : "";
  const crossClause =
    crossTrainingCount > 0
      ? ` Plus ${crossTrainingCount} cross-training ${crossTrainingCount === 1 ? "session" : "sessions"}.`
      : "";
  return (
    <p
      className="font-serif text-2xl md:text-3xl leading-snug text-ink rise"
      aria-live="polite"
    >
      {runCount} runs across {weeks} weeks.{workoutClause}{crossClause}
      {" "}Let&rsquo;s look at a few of them.
    </p>
  );
}
