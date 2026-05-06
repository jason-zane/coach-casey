"use client";

import { useRef, useState, useTransition } from "react";
import {
  deferPlan,
  extractPlanFile,
  optOutOfPlan,
  savePlanText,
  saveExtractedPlan,
  type ExtractPlanFileResult,
} from "@/app/actions/plan";
import {
  GhostButton,
  PrimaryButton,
  StepFooter,
  StepHeader,
  Textarea,
} from "@/app/onboarding/_components/form";

type CoachingMode = "coach" | "self";
type Mode = "choose" | "paste" | "upload" | "review";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

export default function PlanStepPage() {
  const [mode, setMode] = useState<Mode>("choose");
  const [planText, setPlanText] = useState("");
  const [coachingMode, setCoachingMode] = useState<CoachingMode | "">("");

  // Set on a successful extraction; surfaces in the review step.
  const [extracted, setExtracted] = useState<{
    text: string;
    confidence: "high" | "medium" | "low" | "unknown";
    confidenceNote: string | null;
    sourceMime: string;
    sourceFilename: string;
  } | null>(null);

  const [extractError, setExtractError] = useState<string | null>(null);
  const [extracting, startExtract] = useTransition();
  const [saving, startSave] = useTransition();
  const [savingExtracted, startSaveExtracted] = useTransition();
  const [pendingDefer, startDefer] = useTransition();
  const [pendingOptOut, startOptOut] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const anyPending =
    extracting || saving || savingExtracted || pendingDefer || pendingOptOut;

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

  function savePasted() {
    startSave(async () => {
      const fd = new FormData();
      fd.set("plan_text", planText);
      if (coachingMode) fd.set("coaching_mode", coachingMode);
      await savePlanText(fd);
    });
  }

  function saveExtractedConfirmed() {
    if (!extracted) return;
    startSaveExtracted(async () => {
      const fd = new FormData();
      fd.set("plan_text", planText);
      fd.set("source_mime", extracted.sourceMime);
      fd.set("source_filename", extracted.sourceFilename);
      fd.set("from_onboarding", "1");
      if (coachingMode) fd.set("coaching_mode", coachingMode);
      await saveExtractedPlan(fd);
    });
  }

  function handleFile(file: File | null) {
    if (!file) return;
    setExtractError(null);
    startExtract(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const result: ExtractPlanFileResult = await extractPlanFile(fd);
      if (result.kind === "error") {
        setExtractError(result.message);
        return;
      }
      setExtracted({
        text: result.extractedText,
        confidence: result.confidence,
        confidenceNote: result.confidenceNote,
        sourceMime: result.sourceMime,
        sourceFilename: result.sourceFilename,
      });
      setPlanText(result.extractedText);
      setMode("review");
    });
  }

  return (
    <div className="space-y-10">
      <StepHeader
        eyebrow="Your training plan"
        title={<>Got a plan you&rsquo;re following?</>}
        description={
          <>
            If I can see your plan, I can tell you whether a run matched what it
            was meant to be, not just whether it happened. Up to you when you
            share it.
          </>
        }
      />

      {mode === "choose" && (
        <div className="space-y-6">
          <CoachingModePicker
            value={coachingMode}
            onChange={setCoachingMode}
            disabled={anyPending}
          />

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setMode("upload")}
              disabled={anyPending}
              className="w-full rounded-md border border-rule bg-surface p-5 text-left transition-colors hover:border-rule-strong disabled:opacity-50"
            >
              <div className="font-serif text-lg text-ink">
                Upload a screenshot or PDF.
              </div>
              <div className="font-sans text-sm text-ink-muted mt-1">
                A photo of your coach&rsquo;s spreadsheet, a TrainingPeaks PDF
                export, a screenshot of this week&rsquo;s plan from Runna, etc.
                I&rsquo;ll read it and you can correct anything before I save.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode("paste")}
              disabled={anyPending}
              className="w-full rounded-md border border-rule bg-surface p-5 text-left transition-colors hover:border-rule-strong disabled:opacity-50"
            >
              <div className="font-serif text-lg text-ink">
                Paste it as text.
              </div>
              <div className="font-sans text-sm text-ink-muted mt-1">
                Copy from a coach email, a spreadsheet, or anywhere readable.
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
                No plan, no problem. I&rsquo;ll work with what&rsquo;s in front
                of me.
              </div>
            </button>
          </div>
        </div>
      )}

      {mode === "paste" && (
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
              disabled={saving}
            >
              Back
            </GhostButton>
            <PrimaryButton
              type="button"
              onClick={savePasted}
              disabled={!planText.trim()}
              loading={saving}
              loadingLabel="Saving…"
            >
              Save plan
            </PrimaryButton>
          </StepFooter>
        </div>
      )}

      {mode === "upload" && (
        <div className="space-y-4">
          <UploadInstructions />
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            disabled={extracting}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            className="block w-full font-sans text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-4 file:py-2 file:font-sans file:text-sm file:text-white hover:file:opacity-90 disabled:opacity-50"
          />
          {extracting && (
            <p className="font-sans text-sm text-ink-muted">
              Reading your plan… this can take 10–20 seconds for a longer PDF.
            </p>
          )}
          {extractError && (
            <p
              role="alert"
              className="font-sans text-sm text-status-fail"
            >
              {extractError}
            </p>
          )}
          <StepFooter>
            <GhostButton
              type="button"
              onClick={() => setMode("choose")}
              disabled={extracting}
            >
              Back
            </GhostButton>
          </StepFooter>
        </div>
      )}

      {mode === "review" && extracted && (
        <div className="space-y-4">
          <ConfidenceBanner
            confidence={extracted.confidence}
            note={extracted.confidenceNote}
          />
          <label
            htmlFor="plan_text_review"
            className="block font-sans text-sm text-ink-muted"
          >
            Here&rsquo;s what I read. Edit anything that&rsquo;s wrong, then
            save.
          </label>
          <Textarea
            id="plan_text_review"
            rows={16}
            value={planText}
            onChange={(e) => setPlanText(e.target.value)}
            className="font-mono"
          />
          <StepFooter>
            <GhostButton
              type="button"
              onClick={() => {
                setExtracted(null);
                setPlanText("");
                setMode("upload");
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              disabled={savingExtracted}
            >
              Try a different file
            </GhostButton>
            <PrimaryButton
              type="button"
              onClick={saveExtractedConfirmed}
              disabled={!planText.trim()}
              loading={savingExtracted}
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

function CoachingModePicker({
  value,
  onChange,
  disabled,
}: {
  value: CoachingMode | "";
  onChange: (v: CoachingMode | "") => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
        Who&rsquo;s writing your training?
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(value === "coach" ? "" : "coach")}
          disabled={disabled}
          className={`flex-1 rounded-md border px-4 py-2.5 font-sans text-sm transition-colors ${
            value === "coach"
              ? "border-accent bg-accent/10 text-ink"
              : "border-rule text-ink hover:border-rule-strong"
          } disabled:opacity-50`}
        >
          A coach
        </button>
        <button
          type="button"
          onClick={() => onChange(value === "self" ? "" : "self")}
          disabled={disabled}
          className={`flex-1 rounded-md border px-4 py-2.5 font-sans text-sm transition-colors ${
            value === "self"
              ? "border-accent bg-accent/10 text-ink"
              : "border-rule text-ink hover:border-rule-strong"
          } disabled:opacity-50`}
        >
          Me, or a public plan
        </button>
      </div>
      <p className="font-sans text-xs text-ink-subtle">
        Optional. Lets me know whether to defer to your coach&rsquo;s intent or
        engage with workout choices when you ask.
      </p>
    </div>
  );
}

function UploadInstructions() {
  return (
    <div className="space-y-2 rounded-md border border-rule bg-surface p-4">
      <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
        What works best
      </p>
      <ul className="list-disc space-y-1 pl-5 font-sans text-sm text-ink-muted">
        <li>
          A clear screenshot of one week, or up to a full block. Crop tightly,
          tiny text on a phone screen is the main reason extractions go wrong.
        </li>
        <li>
          A PDF export from TrainingPeaks, Final Surge, Runna, McMillan,
          Pfitzinger, etc. PDFs with selectable text work better than scans.
        </li>
        <li>
          Photos of a paper plan or whiteboard work, but readable handwriting
          beats messy. If you can, type a hard-to-read line in the review
          step.
        </li>
      </ul>
      <p className="font-sans text-xs text-ink-subtle">
        Max 10 MB per file. PNG, JPG, WebP, GIF, or PDF.
      </p>
    </div>
  );
}

function ConfidenceBanner({
  confidence,
  note,
}: {
  confidence: "high" | "medium" | "low" | "unknown";
  note: string | null;
}) {
  if (confidence === "high") {
    return (
      <p className="rounded-md border border-rule bg-surface px-3 py-2 font-sans text-sm text-ink-muted">
        Read cleanly. Worth a quick scan to be sure.
      </p>
    );
  }
  if (confidence === "medium") {
    return (
      <p className="rounded-md border border-rule bg-surface px-3 py-2 font-sans text-sm text-ink-muted">
        Read mostly cleanly{note ? `, ${note}` : ""}. Check the days that look
        off, then save.
      </p>
    );
  }
  if (confidence === "low") {
    return (
      <p className="rounded-md border border-rule bg-surface px-3 py-2 font-sans text-sm text-ink">
        I had to guess at parts of this{note ? `, ${note}` : ""}. Read it
        through carefully and edit anything wrong before saving.
      </p>
    );
  }
  return null;
}
