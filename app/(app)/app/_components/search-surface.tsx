"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { searchMessages } from "@/app/actions/thread";
import type { SearchResult } from "@/lib/thread/search";

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (isoDate: string) => void;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function labelForResult(r: SearchResult): string {
  if (r.kind === "activity") return "Run";
  switch (r.messageKind) {
    case "debrief":
      return "Debrief";
    case "weekly_review":
      return "Weekly review";
    case "follow_up":
      return "Follow-up";
    case "chat_casey":
      return "Coach Casey";
    case "chat_user":
      return "You";
    case "system":
      return "System";
    default:
      return "Message";
  }
}

function highlightMatches(snippet: string, query: string): React.ReactNode[] {
  const terms = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (terms.length === 0) return [snippet];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = snippet.split(re);
  // String.split with a capturing group yields [text, match, text, match, …];
  // odd indices are the matched terms.
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong
        key={i}
        className="font-medium text-ink underline decoration-accent/60 decoration-[1.5px] underline-offset-[3px]"
      >
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function SearchSurface({ open, onClose, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      startTransition(async () => {
        const res = await searchMessages(q);
        setResults(res);
      });
    }, 180);
    return () => clearTimeout(id);
  }, [query, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal aria-label="Search">
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px] overlay-in"
        onClick={onClose}
      />
      <div
        className="absolute inset-y-0 right-0 w-full sm:w-[420px] bg-paper border-l border-rule slide-in-right flex flex-col"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-rule/60">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
            <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M13.5 13.5l3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages, debriefs, runs"
            className="flex-1 bg-transparent font-sans text-[15px] text-ink placeholder:text-ink-subtle focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="font-sans text-[13px] text-ink-muted px-2"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="px-5 py-8 font-sans text-[14px] text-ink-subtle">
              Type a word or two. Matches across your chat, debriefs, weekly reviews,
              and run names.
            </div>
          ) : pending && results.length === 0 ? (
            <div className="px-5 py-8 font-mono text-[11px] uppercase tracking-wider text-ink-subtle breath">
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-5 py-8 font-sans text-[14px] text-ink-muted">
              Nothing matching that here yet.
            </div>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={`${r.kind}-${r.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(r.createdAt);
                      onClose();
                    }}
                    className="w-full text-left pl-4 pr-5 py-3 border-b border-rule/40 hover:bg-rule/30 border-l-[2px] border-l-transparent hover:border-l-accent/40 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
                        {labelForResult(r)}
                      </span>
                      <span
                        className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle"
                        suppressHydrationWarning
                      >
                        {formatDate(r.createdAt)}
                      </span>
                    </div>
                    <div className="font-sans text-[14px] text-ink-muted leading-[1.5]">
                      {highlightMatches(r.snippet, query)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
