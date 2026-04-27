"use client";

import { useState, useTransition } from "react";
import {
  addMemoryItem,
  deleteMemoryItem,
  updateMemoryItem,
} from "@/app/actions/athlete-edits";

type Item = {
  id: string;
  content: string;
  tags: string[];
  /** Pre-formatted date label, e.g. "First mentioned Apr 12, 2026". */
  dateLabel: string;
  /** Pre-formatted header line. Null when the item shouldn't render a header (life context). */
  header: string | null;
};

type Props = {
  kind: "injury" | "context";
  items: Item[];
  /** Title above the add form, e.g. "Add a niggle". */
  addLabel: string;
  /** Placeholder for the content textarea. */
  contentPlaceholder: string;
  /** Whether to render the tags field. Niggles use it (body part); life context skips it. */
  showTags: boolean;
};

export function MemoryListEditor({
  kind,
  items,
  addLabel,
  contentPlaceholder,
  showTags,
}: Props) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((item) => (
            <MemoryRow
              key={item.id}
              item={item}
              showTags={showTags}
            />
          ))}
        </ul>
      )}

      {adding ? (
        <AddForm
          kind={kind}
          contentPlaceholder={contentPlaceholder}
          showTags={showTags}
          onDone={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}

function MemoryRow({
  item,
  showTags,
}: {
  item: Item;
  showTags: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState(item.content);
  const [tagsText, setTagsText] = useState(item.tags.join(", "));

  function handleSave() {
    setError(null);
    const trimmed = content.trim();
    if (!trimmed) {
      setError("Add some text first.");
      return;
    }
    const tags = showTags
      ? tagsText
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : item.tags;
    startTransition(async () => {
      try {
        await updateMemoryItem(item.id, { content: trimmed, tags });
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteMemoryItem(item.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't delete");
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
        {showTags && (
          <input
            type="text"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="Tags (comma-separated, e.g. calf, right)"
            className="block w-full bg-paper border border-rule rounded-[6px] px-3 h-9 text-[14px] text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent/60"
            disabled={pending}
          />
        )}
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
              setTagsText(item.tags.join(", "));
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

  return (
    <li className="text-[14px] leading-[1.55]">
      {item.header && (
        <div className="text-ink font-medium">{item.header}</div>
      )}
      <div className="text-ink-muted">{item.content}</div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-ink-subtle pt-0.5">
        {item.dateLabel}
      </div>
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
              onClick={handleDelete}
              disabled={pending}
              className="text-red-700 hover:text-red-900 transition-colors duration-150"
            >
              {pending ? "Deleting…" : "Confirm delete"}
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
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

function AddForm({
  kind,
  contentPlaceholder,
  showTags,
  onDone,
}: {
  kind: "injury" | "context";
  contentPlaceholder: string;
  showTags: boolean;
  onDone: () => void;
}) {
  const [content, setContent] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    setError(null);
    const trimmed = content.trim();
    if (!trimmed) {
      setError("Add some text first.");
      return;
    }
    const tags = showTags
      ? tagsText
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [];
    startTransition(async () => {
      try {
        await addMemoryItem({ kind, content: trimmed, tags });
        setContent("");
        setTagsText("");
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add");
      }
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        placeholder={contentPlaceholder}
        className="block w-full bg-paper border border-rule rounded-[6px] px-3 py-2 text-[14px] text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent/60 resize-y"
        disabled={pending}
        autoFocus
      />
      {showTags && (
        <input
          type="text"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder="Tags (comma-separated, e.g. calf, right)"
          className="block w-full bg-paper border border-rule rounded-[6px] px-3 h-9 text-[14px] text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent/60"
          disabled={pending}
        />
      )}
      {error && (
        <p className="text-[13px] text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending}
          className="inline-flex items-center h-9 px-3 rounded-[6px] bg-ink text-paper text-[13px] font-medium hover:opacity-90 transition-opacity duration-150 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="inline-flex items-center h-9 px-3 rounded-[6px] text-ink-muted text-[13px] hover:text-ink transition-colors duration-150"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
