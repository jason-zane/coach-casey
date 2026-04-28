"use client";

import { useState, useTransition } from "react";
import { deferPlan, optOutOfPlan, savePlanText } from "@/app/actions/plan";
import {
  GhostButton,
  PrimaryButton,
  StepFooter,
  StepHeader,
  Textarea,
} from "@/app/onboarding/_components/form";

type CoachingMode = "coach" | "self";

export default function PlanStepPage() {
  const [mode, setMode] = useState<"choose" | "upload">("choose");
  const [planText, setPlanText] = useState("");
  const [coachingMode, setCoachingMode] = useState<CoachingMode | "">("");
  const [pending, startTransition] = useTransition();
  const [pendingDefer, startDefer] = useTransition();
  const [pendingOptOut, startOptOut] = useTransition();

  function defer() {
    startDefer(async () => {
      const fd = new FormData();
      if (coachingMode) fd.set("coaching_mode", coachingMode);
      await deferPlan(fd);
    });
  }

  function optOut() {
    startOptOut(async () => {
      await optOutOfPlan();
    });
  }

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("plan_text", planText);
      if (coachingMode) fd.set("coaching_mode", coachingMode);
      await savePlanText(fd);
    });
  }

  const anyPending = pending || pendingDefer || pendingOptOut;

  return (
    <div className="space-y-10">
      <StepHeader
        eyebrow="Your training plan"
        title={<>Got a plan you&rsquo;re following?</>}
        description={
          <>
            If I can see your plan, I can tell you whether a run matched what
            it was meant to be, not just whether it happened. Up to you when
            you share it.
          </>
        }
      />

      {mode === "choose" ? (
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
              Who&rsquo;s writing your training?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setCoachingMode((m) => (m === "coach" ? "" : "coach"))
                }
                disabled={anyPending}
                className={`flex-1 rounded-md border px-4 py-2.5 font-sans text-sm transition-colors ${
                  coachingMode === "coach"
                    ? "border-accent bg-accent/10 text-ink"
                    : "border-rule text-ink hover:border-rule-strong"
                } disabled:opacity-50`}
              >
                A coach
              </button>
              <button
                type="button"
                onClick={() =>
                  setCoachingMode((m) => (m === "self" ? "" : "self"))
                }
                disabled={anyPending}
                className={`flex-1 rounded-md border px-4 py-2.5 font-sans text-sm transition-colors ${
                  coachingMode === "self"
                    ? "border-accent bg-accent/10 text-ink"
                    : "border-rule text-ink hover:border-rule-strong"
                } disabled:opacity-50`}
              >
                Me, or a public plan
              </button>
            </div>
            <p className="font-sans text-xs text-ink-subtle">
              Optional. Lets me know whether to defer to your coach&rsquo;s
              intent or engage with workout choices when you ask.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setMode("upload")}
              disabled={anyPending}
              className="w-full rounded-md border border-rule bg-surface p-5 text-left transition-colors hover:border-rule-strong disabled:opacity-50"
            >
              <div className="font-serif text-lg text-ink">
                Paste it in now.
              </div>
              <div className="font-sans text-sm text-ink-muted mt-1">
                Copy the week from TrainingPeaks, Final Surge, a coach email, a
                spreadsheet. Anything readable.
              </div>
            </button>

            <button
              type="button"
              onClick={defer}
              disabled={anyPending}
              className="w-full rounded-md border border-rule bg-surface p-5 text-left transition-colors hover:border-rule-strong disabled:opacity-50"
            >
              <div className="font-serif text-lg text-ink">
                {pendingDefer ? "Saving…" : "I’ll add it later."}
              </div>
              <div className="font-sans text-sm text-ink-muted mt-1">
                I&rsquo;ll check back after your first run or two. No pressure.
              </div>
            </button>

            <button
              type="button"
              onClick={optOut}
              disabled={anyPending}
              className="w-full rounded-md border border-rule bg-surface p-5 text-left transition-colors hover:border-rule-strong disabled:opacity-50"
            >
              <div className="font-serif text-lg text-ink">
                {pendingOptOut
                  ? "Saving…"
                  : "I’m not following a structured plan."}
              </div>
              <div className="font-sans text-sm text-ink-muted mt-1">
                No plan, no problem. I&rsquo;ll work with what&rsquo;s in
                front of me.
              </div>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <label
            htmlFor="plan_text"
            className="block font-sans text-sm text-ink-muted"
          >
            Paste the plan (this week is enough, or the whole block if you have
            it)
          </label>
          <Textarea
            id="plan_text"
            name="plan_text"
            rows={12}
            required
            value={planText}
            onChange={(e) => setPlanText(e.target.value)}
            placeholder={
              "Mon, easy 10km\nTue, 6 x 1km at threshold, 2min jog\nWed, easy 8km\n..."
            }
            className="font-mono"
          />
          <StepFooter>
            <GhostButton
              type="button"
              onClick={() => setMode("choose")}
              disabled={pending}
            >
              Back
            </GhostButton>
            <PrimaryButton
              type="button"
              onClick={save}
              disabled={!planText.trim()}
              loading={pending}
              loadingLabel="Saving…"
            >
              Save plan
            </PrimaryButton>
          </StepFooter>
        </div>
      )}
    </div>
  );
}
