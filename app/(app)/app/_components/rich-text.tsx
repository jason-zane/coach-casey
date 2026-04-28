import { Fragment, type ReactNode } from "react";

/**
 * Render chat copy with a minimal subset of Markdown, only what the model
 * is likely to emit despite being told not to, and what's safe to surface
 * inline. Not a full Markdown parser; this is a safety net over prompt
 * guidance in `prompts/chat-system.md`.
 *
 * Handles:
 *   - `**bold**`      → <strong>
 *   - `_italic_`      → <em>
 *   - `` `code` ``    → <code>
 *
 * Deliberately skipped: block-level headings, lists, links, images, single-
 * asterisk italic (too ambiguous against literal asterisks).
 *
 * Safe by construction, we only return React elements; no raw HTML is ever
 * injected, so nothing the model emits can break out into markup.
 */
export function renderInlineCopy(text: string): ReactNode {
  if (!text) return null;
  const pattern = /(\*\*[^*\n]+?\*\*|_[^_\n]+?_|`[^`\n]+?`)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      out.push(
        <Fragment key={`t${key++}`}>{text.slice(last, match.index)}</Fragment>,
      );
    }
    const token = match[0];
    if (token.startsWith("**")) {
      out.push(
        <strong key={`b${key++}`} className="font-medium">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("_")) {
      out.push(
        <em key={`i${key++}`} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else {
      out.push(
        <code
          key={`c${key++}`}
          className="font-mono text-[0.92em] text-ink-muted bg-ink/[0.04] px-1 py-[1px] rounded-sm"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    out.push(<Fragment key={`t${key++}`}>{text.slice(last)}</Fragment>);
  }

  return out;
}
