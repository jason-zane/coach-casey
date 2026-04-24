"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onSend: (body: string) => void | Promise<void>;
  disabled?: boolean;
};

export function Composer({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const max = 180;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);

  async function submit() {
    const body = value.trim();
    if (!body || disabled) return;
    setValue("");
    // Subtle haptic on send (interaction-principles §7.1). Ignored on
    // browsers/devices without the Vibration API.
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // no-op
      }
    }
    await onSend(body);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Desktop: Return sends, Shift+Return = newline.
    // Mobile: soft-keyboard Enter inserts newline (no keyDown for Enter on
    // most mobile keyboards when pressed as "return" — the send button is
    // the primary path).
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex items-end gap-2 px-4 sm:px-6 py-3 bg-paper/95 backdrop-blur-sm border-t border-rule/60"
    >
      <textarea
        id="chat-input"
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder="Message Coach Casey"
        className="flex-1 resize-none bg-surface border border-rule/70 rounded-2xl px-4 py-2.5 font-sans text-[15px] leading-snug text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent/60"
        disabled={disabled}
      />
      <button
        type="submit"
        disabled={disabled || value.trim().length === 0}
        aria-label="Send"
        className="shrink-0 rounded-full bg-accent text-accent-ink h-10 w-10 grid place-items-center disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M2 8h11M8 3l5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </form>
  );
}
