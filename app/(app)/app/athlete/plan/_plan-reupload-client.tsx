"use client";

import { useRef, useState, useTransition } from "react";
import {
  extractPlanFile,
  saveExtractedPlan,
  saveTextPlanFromAthletePage,
  type ExtractPlanFileResult,
} from "@/app/actions/plan";
import {
  GhostButton,
  PrimaryButton,
  Textarea,
} from "@/app/onboarding/_components/form";

type CoachingMode = "coach" | "self" | null;
type Mode = "choose" | "paste" | "upload" | "review";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

export function PlanReuploadClient({
  coachingMode,
  hasExistingPlan,
}: {
  coachingMode: CoachingMode;
  hasExistingPlan: boolean;
}) {
  const [mode, setMode] = useState<Mode>("choose");
  const [planText, setPlanText] = useState("");
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  function saveExtractedConfirmed() {
    if (!extracted) return;
    startSave(async () => {
      const fd = new FormData();
      fd.set("plan_text", planText);
      fd.set("source_mime", extracted.sourceMime);
      fd.set("source_filename", extracted.sourceFilename);
      // No from_onboarding flag, the action redirects back to /app/athlete.
      if (coachingMode) fd.set("coaching_mode", coachingMode);
      await saveExtractedPlan(fd);
    });
  }

  function savePasted() {
    startSave(async () => {
      const fd = new FormData();
      fd.set("plan_text", planText);
      if (coachingMode) fd.set("coaching_mode", coachingMode);
      await saveTextPlanFromAthletePage(fd);
    });
  }

  return (
    <div className="space-y-6">
      {mode === "choose" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setMode("upload")}
            disabled={extracting || saving}
            className="w-full rounded-md border border-rule bg-surface p-5 text-left transition-colors hover:border-rule-strong disabled:opacity-50"
          >
            <div className="font-serif text-lg text-ink">
              {hasExistingPlan ? "Upload a new screenshot or PDF." : "Upload a screenshot or PDF."}
            </div>
            <div className="font-sans text-sm text-ink-muted mt-1">
              I&rsquo;ll read the file and you can correct anything before I
              save it. Crop tightly, tiny text is the main reason extractions
              go wrong.
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode("paste")}
            disabled={extracting || saving}
            className="w-full rounded-md border border-rule bg-surface p-5 text-left transition-colors hover:border-rule-strong disabled:opacity-50"
          >
            <div className="font-serif text-lg text-ink">
              Paste it as text.
            </div>
            <div className="font-sans text-sm text-ink-muted mt-1">
              Copy from a coach email, a spreadsheet, or anywhere readable.
            </div>
          </button>
        </div>
      )}

      {mode === "paste" && (
        <div className="space-y-4">
          <label
            htmlFor="plan_text"
            className="block font-sans text-sm text-ink-muted"
          >
            Paste the plan (this week is enough, or the whole block)
          </label>
          <Textarea
            id="plan_text"
            rows={14}
            required
            value={planText}
            onChange={(e) => setPlanText(e.target.value)}
            placeholder={
              "Mon, easy 10km\nTue, 6 x 1km at threshold, 2min jog\n..."
            }
            className="font-mono"
          />
          <div className="flex items-center justify-between">
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
          </div>
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
            <p role="alert" className="font-sans text-sm text-status-fail">
              {extractError}
            </p>
          )}
          <GhostButton
            type="button"
            onClick={() => setMode("choose")}
            disabled={extracting}
          >
            Back
          </GhostButton>
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
          <div className="flex items-center justify-between">
            <GhostButton
              type="button"
              onClick={() => {
                setExtracted(null);
                setPlanText("");
                setMode("upload");
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              disabled={saving}
            >
              Try a different file
            </GhostButton>
            <PrimaryButton
              type="button"
              onClick={saveExtractedConfirmed}
              disabled={!planText.trim()}
              loading={saving}
              loadingLabel="Saving…"
            >
              Save plan
            </PrimaryButton>
          </div>
        </div>
      )}
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
        <li>One week or one block at a time. Tight crops beat big screenshots.</li>
        <li>
          PDF exports from TrainingPeaks / Final Surge / Runna / McMillan /
          Pfitzinger work well. Selectable-text PDFs read more cleanly than
          scans.
        </li>
        <li>Photos of paper plans work; legible handwriting is the limit.</li>
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
        off.
      </p>
    );
  }
  if (confidence === "low") {
    return (
      <p className="rounded-md border border-rule bg-surface px-3 py-2 font-sans text-sm text-ink">
        I had to guess at parts of this{note ? `, ${note}` : ""}. Read it
        through carefully and edit before saving.
      </p>
    );
  }
  return null;
}
