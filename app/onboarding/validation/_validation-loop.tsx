"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import {
  finishValidation,
  generateNextValidationObservation,
  recordValidationResponse,
} from "@/app/actions/validation";

type Entry = {
  sequenceIdx: number;
  text: string;
  chip: string | null;
  response: string | null;
  submitted: boolean;
};

const CHIPS = [
  { key: "yes", label: "Yep" },
  { key: "partial", label: "Close" },
  { key: "no", label: "Not quite" },
];

export function ValidationLoop({
  initialObservations,
}: {
  initialObservations: Entry[];
}) {
  const [entries, setEntries] = useState<Entry[]>(initialObservations);
  const [draftChip, setDraftChip] = useState<string | null>(null);
  const [draftText, setDraftText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fetchedOnceRef = useRef(false);

  const current = entries[entries.length - 1];
  const currentIsOpen = current && !current.submitted;
  const canFinish = entries.filter((e) => e.submitted).length >= 3;

  // Auto-fetch the first observation if none exist
  useEffect(() => {
    if (entries.length > 0 || fetchedOnceRef.current) return;
    fetchedOnceRef.current = true;
    fetchNext();

  }, []);

  async function fetchNext() {
    setLoading(true);
    setError(null);
    // Minimum visible hold for the "Casey is reading" beat. Even when the
    // model returns quickly, we want the moment to feel like attention,
    // not a request/response. Load-bearing for the product's voice.
    const MIN_HOLD_MS = 900;
    const startedAt = Date.now();
    try {
      const res = await generateNextValidationObservation();
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_HOLD_MS) {
        await new Promise((r) => setTimeout(r, MIN_HOLD_MS - elapsed));
      }
      if (!res || res.done) {
        setDone(true);
      } else {
        setEntries((prev) => [
          ...prev,
          {
            sequenceIdx: res.sequenceIdx,
            text: res.text,
            chip: null,
            response: null,
            submitted: false,
          },
        ]);
        setDraftChip(null);
        setDraftText("");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      // Trim Anthropic's wrapper noise down to the human-readable reason.
      // Pull "message" out of Anthropic's JSON wrapper if present, otherwise
      // fall through to the raw string. Using [\s\S] instead of the `s` flag
      // so this compiles against older JS targets.
      let cleaned = msg.replace(/^\d+\s+/, "");
      const match = cleaned.match(/"message":"([^"]+)"/);
      if (match) cleaned = match[1];
      setError(cleaned.slice(0, 240));
    } finally {
      setLoading(false);
    }
  }

  function chooseChip(key: string) {
    setDraftChip(key);
    if (key !== "yes") {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }

  async function submit() {
    if (!current) return;
    const chip = draftChip;
    const text = draftText.trim() || null;
    if (!chip && !text) return;

    setEntries((prev) =>
      prev.map((e, i) =>
        i === prev.length - 1 ? { ...e, chip, response: text, submitted: true } : e,
      ),
    );
    setDraftChip(null);
    setDraftText("");

    await recordValidationResponse(current.sequenceIdx, chip, text);

    if (entries.length >= 5) {
      setDone(true);
      return;
    }
    await fetchNext();
  }

  function finish() {
    startTransition(async () => {
      await finishValidation();
    });
  }

  return (
    <div className="space-y-8">
      <ul className="space-y-6">
        {entries.map((e, i) => (
          <li
            key={e.sequenceIdx}
            className={`space-y-3 ${i === entries.length - 1 ? "rise-observation" : ""}`}
          >
            <p className="font-serif text-xl leading-relaxed text-ink">
              {e.text}
            </p>
            {e.submitted ? (
              <div className="font-sans text-sm text-ink-muted space-y-1">
                {e.chip ? (
                  <p>
                    <span className="font-mono text-xs uppercase tracking-wider text-ink-subtle mr-2">
                      You
                    </span>
                    {chipLabel(e.chip)}
                  </p>
                ) : null}
                {e.response ? (
                  <p className="italic text-ink">&ldquo;{e.response}&rdquo;</p>
                ) : null}
              </div>
            ) : i === entries.length - 1 ? (
              <div className="space-y-3 rise-response">
                <div className="flex flex-wrap gap-2">
                  {CHIPS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => chooseChip(c.key)}
                      className={`rounded-full border px-3.5 py-1.5 font-sans text-sm transition-colors ${
                        draftChip === c.key
                          ? "border-accent bg-accent text-accent-ink"
                          : "border-rule text-ink hover:border-rule-strong"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  value={draftText}
                  onChange={(ev) => setDraftText(ev.target.value)}
                  rows={draftChip && draftChip !== "yes" ? 3 : 2}
                  placeholder={
                    draftChip === "no"
                      ? "What's off?"
                      : draftChip === "partial"
                        ? "What would you change?"
                        : "Add anything, or skip."
                  }
                  className="w-full resize-none rounded-md border border-rule bg-surface px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-subtle outline-none transition-colors focus:border-accent"
                />
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={
                      pending ||
                      (!draftChip && draftText.trim().length === 0)
                    }
                    className="rounded-md bg-accent px-4 py-2 font-sans text-sm text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Send
                  </button>
                  <button
                    type="button"
                    onClick={finish}
                    disabled={pending}
                    className="font-sans text-xs text-ink-subtle underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    {pending ? "Moving on…" : "Move on"}
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {loading ? (
        <p
          className="font-mono text-xs uppercase tracking-wider text-ink-subtle breath"
          aria-live="polite"
        >
          Casey is reading
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-rule-strong bg-surface px-4 py-3 space-y-2"
        >
          <p className="font-sans text-sm text-ink">
            Couldn&rsquo;t generate an observation right now.
          </p>
          <p className="font-mono text-xs text-ink-muted break-words">
            {error}
          </p>
          <button
            type="button"
            onClick={fetchNext}
            className="rounded-md border border-rule px-3 py-1.5 font-sans text-xs text-ink hover:border-rule-strong"
          >
            Try again
          </button>
        </div>
      ) : null}

      {done || (canFinish && !currentIsOpen && !loading) ? (
        <div className="border-t border-rule/60 pt-6 space-y-3">
          <p className="font-sans text-sm text-ink-muted">
            {done ? "That's a good read for now." : "Ready to move on?"}
          </p>
          <button
            type="button"
            onClick={finish}
            disabled={pending}
            className="rounded-md bg-ink px-4 py-2 font-sans text-sm text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Continuing\u2026" : "Continue"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function chipLabel(key: string): string {
  switch (key) {
    case "yes":
      return "Yep";
    case "partial":
      return "Close";
    case "no":
      return "Not quite";
    default:
      return key;
  }
}
