"use client";

import { useState } from "react";

/** Copies the shared invite link to the clipboard, with a brief confirmation. */
export function CopyInvite({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded bg-surface px-2 py-1 font-mono text-[11px] text-ink-muted break-all">
        {url}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked; the link is visible to select manually */
          }
        }}
        className="rounded-md border border-rule px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-subtle transition-colors hover:border-rule-strong hover:text-ink"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
