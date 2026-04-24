"use client";

import { useState, useTransition } from "react";
import { deferPlan, optOutOfPlan, savePlanText } from "@/app/actions/plan";

export default function PlanStepPage() {
  const [mode, setMode] = useState<"choose" | "upload">("choose");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
          Your training plan
        </p>
        <h1 className="font-serif text-3xl leading-tight text-ink md:text-4xl">
          Got a plan you&rsquo;re following?
        </h1>
        <p className="prose-serif text-ink-muted max-w-prose">
          If I can see your plan, I can tell you whether a run matched what it
          was meant to be, not just whether it happened. Up to you when you
          share it.
        </p>
      </header>

      {mode === "choose" ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className="w-full rounded-md border border-rule bg-surface p-5 text-left transition-colors hover:border-rule-strong"
          >
            <div className="font-serif text-lg text-ink">Paste it in now.</div>
            <div className="font-sans text-sm text-ink-muted mt-1">
              Copy the week from TrainingPeaks, Final Surge, a coach email, a
              spreadsheet. Anything readable.
            </div>
          </button>

          <form action={deferPlan}>
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md border border-rule bg-surface p-5 text-left transition-colors hover:border-rule-strong"
            >
              <div className="font-serif text-lg text-ink">
                I&rsquo;ll add it later.
              </div>
              <div className="font-sans text-sm text-ink-muted mt-1">
                I&rsquo;ll check back after your first run or two. No pressure.
              </div>
            </button>
          </form>

          <form action={optOutOfPlan}>
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md border border-rule bg-surface p-5 text-left transition-colors hover:border-rule-strong"
            >
              <div className="font-serif text-lg text-ink">
                I&rsquo;m not following a structured plan.
              </div>
              <div className="font-sans text-sm text-ink-muted mt-1">
                No plan, no problem. I&rsquo;ll work with what&rsquo;s in front
                of me.
              </div>
            </button>
          </form>
        </div>
      ) : (
        <form
          action={(fd) => startTransition(() => savePlanText(fd))}
          className="space-y-4"
        >
          <label
            htmlFor="plan_text"
            className="block font-sans text-sm text-ink-muted"
          >
            Paste the plan (this week is enough, or the whole block if you have
            it)
          </label>
          <textarea
            id="plan_text"
            name="plan_text"
            rows={12}
            required
            placeholder="Mon — easy 10km&#10;Tue — 6 x 1km at threshold, 2min jog&#10;Wed — easy 8km&#10;..."
            className="w-full rounded-md border border-rule bg-surface px-3 py-3 font-mono text-sm text-ink placeholder:text-ink-subtle outline-none transition-colors focus:border-accent"
          />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMode("choose")}
              className="font-sans text-sm text-ink-muted underline-offset-4 hover:underline"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-accent px-5 py-2.5 font-sans text-sm text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Saving\u2026" : "Save plan"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
