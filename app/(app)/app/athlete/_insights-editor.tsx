"use client";

import { useState, useTransition } from "react";
import { correctInsight, dismissInsight } from "@/app/actions/insights";
import type { InsightUiItem } from "@/lib/athlete/page-data";

/**
 * The legible, correctable face of Casey's maintained read. Rows are
 * grouped by layer with a quiet label. Each row can be corrected (the
 * athlete fixes Casey's wording) or dismissed (the belief is wrong or no
 * longer relevant, so it leaves the working read). The athlete never *adds*
 * here: these are Casey's conclusions, not the athlete's notes. Niggles and
 * life context the athlete owns live in the "On the radar" section.
 */
export function InsightsEditor({ items }: { items: InsightUiItem[] }) {
  const groups: { layer: string; label: string; items: InsightUiItem[] }[] = [];
  for (const it of items) {
    let g = groups.find((x) => x.layer === it.layer);
    if (!g) {
      g = { layer: it.layer, label: it.layerLabel, items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.layer} className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
            {g.label}
          </div>
          <ul className="space-y-3">
            {g.items.map((item) => (
              <InsightRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function InsightRow({ item }: { item: InsightUiItem }) {
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState(item.content);

  if (hidden) return null;

  function handleSave() {
    setError(null);
    const trimmed = content.trim();
    if (!trimmed) {
      setError("Add some text first.");
      return;
    }
    startTransition(async () => {
      const res = await correctInsight(item.id, trimmed);
      if (res.ok) setEditing(false);
      else setError("Couldn't save");
    });
  }

  function handleDismiss() {
    setError(null);
    startTransition(async () => {
      const res = await dismissInsight(item.id);
      if (res.ok) setHidden(true);
      else {
        setError("Couldn't dismiss");
        setArmed(false);
      }
    });
  }

  if (editing) {
    return (
      <li className="text-[14px] leading-[1.55] space-y-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          className="block w-full bg-paper border border-rule rounded-[6px] px-3 py-2 text-[14px] text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent/60 resize-y"
          disabled={pending}
        />
        {error && (
          <p className="text-[13px] text-red-700" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="inline-flex items-center h-8 px-3 rounded-[6px] bg-ink text-paper text-[13px] font-medium hover:opacity-90 transition-opacity duration-150 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setContent(item.content);
              setError(null);
            }}
            disabled={pending}
            className="inline-flex items-center h-8 px-3 rounded-[6px] text-ink-muted text-[13px] hover:text-ink transition-colors duration-150"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  const meta = [item.recurring ? "recurring" : null, item.ageLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="text-[14px] leading-[1.55]">
      <div className="text-ink-muted">{item.content}</div>
      {meta && (
        <div className="font-mono text-[10px] uppercase tracking-wider text-ink-subtle pt-0.5">
          {meta}
        </div>
      )}
      {error && (
        <p className="text-[13px] text-red-700 pt-1" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-3 pt-1.5 text-[12px]">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-ink-muted hover:text-ink transition-colors duration-150"
        >
          Edit
        </button>
        {armed ? (
          <>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={pending}
              className="text-red-700 hover:text-red-900 transition-colors duration-150"
            >
              {pending ? "Dismissing…" : "Confirm dismiss"}
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              disabled={pending}
              className="text-ink-subtle hover:text-ink-muted transition-colors duration-150"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setArmed(true)}
            className="text-ink-muted hover:text-ink transition-colors duration-150"
          >
            Dismiss
          </button>
        )}
      </div>
    </li>
  );
}
