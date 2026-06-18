"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { runStravaIngest, type IngestSummary } from "@/app/actions/ingest";
import { advanceFrom } from "@/app/actions/onboarding";
import { useAutoAdvance } from "@/app/onboarding/_components/use-auto-advance";

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
  const [errorText, setErrorText] = useState<string | null>(null);
  const router = useRouter();
  const startedRef = useRef(false);

  // Hand off to the next step once the read has settled. This auto-fires after
  // the hold, re-fires if the tab was backgrounded during it, and is also
  // wired to the always-present Continue button below — so no one is stranded
  // here even if a timer was frozen or the page was discarded and reloaded.
  const advance = useAutoAdvance(() => advanceFrom("strava"), {
    enabled: phase === "settled",
    delayMs: SETTLE_HOLD_MS,
  });

  const runIngest = useCallback(() => {
    setErrorText(null);
    setCopyIdx(0);
    setPhase("cycling");
    void (async () => {
      try {
        const res = await runStravaIngest();
        setSummary(res);
        if (res.status === "error") {
          setErrorText(res.error ?? "Unknown error.");
          setPhase("error");
          return;
        }
        setPhase("settled");
      } catch (e) {
        setErrorText(
          e instanceof Error ? e.message : "Couldn’t finish reading.",
        );
        setPhase("error");
      }
    })();
  }, []);

  // Kick the ingest off once on mount.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    runIngest();
  }, [runIngest]);

  // Cycle the copy lines only while the read is in flight.
  useEffect(() => {
    if (phase !== "cycling") return;
    const cycle = setInterval(() => {
      setCopyIdx((i) => (i + 1) % CYCLING_COPY.length);
    }, LINE_INTERVAL_MS);
    return () => clearInterval(cycle);
  }, [phase]);

  if (phase === "error") {
    return (
      <div className="w-full space-y-6">
        <p className="font-serif text-2xl leading-snug text-ink">
          Couldn&rsquo;t finish reading.
        </p>
        <p className="font-mono text-xs text-ink-muted break-words">
          {errorText ?? "Unknown error."}
        </p>
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={runIngest}
            className="rounded-md bg-ink px-4 py-2 font-sans text-sm text-paper transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => router.push("/onboarding/strava")}
            className="font-sans text-sm text-ink-muted underline-offset-4 hover:underline"
          >
            Back to Strava
          </button>
        </div>
      </div>
    );
  }

  if (phase === "settled" && summary) {
    return (
      <div className="w-full space-y-7">
        <SettledLine summary={summary} />
        <div className="space-y-2">
          <button
            type="button"
            onClick={advance.run}
            disabled={advance.pending}
            className="rounded-md bg-ink px-4 py-2 font-sans text-sm text-paper transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {advance.pending ? "Continuing…" : "Continue"}
          </button>
          {advance.error ? (
            <p className="font-sans text-xs text-ink-muted">
              That didn&rsquo;t go through &mdash; tap Continue to try again.
            </p>
          ) : null}
        </div>
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
