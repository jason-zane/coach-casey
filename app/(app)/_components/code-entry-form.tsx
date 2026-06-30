"use client";

import { useActionState } from "react";
import { verifyEmailCode } from "@/app/actions/auth";

/**
 * Same-tab OTP code entry. The user types the 6-digit code from their email
 * back into this field — no link, no leaving the tab, no cross-browser PKCE
 * handoff. This is the robust path on phones (the in-app mail browser, link
 * prefetchers, and the installed PWA all break the "tap a link" flow), and it
 * keeps the user in the exact tab they'll install the PWA from. The emailed
 * link is the fallback. Shared by /signin and /signup.
 */
export function CodeEntryForm({
  email,
  next = "/app",
}: {
  email: string;
  next?: string;
}) {
  const [state, formAction, isPending] = useActionState(verifyEmailCode, null);

  return (
    <div className="w-full max-w-sm space-y-6">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl leading-tight text-ink">
          Check your email.
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          Enter the 6-digit code we sent to{" "}
          <span className="font-mono text-[13px] text-ink">{email}</span>. No
          need to leave this screen.
        </p>
      </header>

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1.5">
          <label
            htmlFor="code"
            className="block font-sans text-sm text-ink-muted"
          >
            6-digit code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            placeholder="123456"
            className="w-full rounded-md border border-rule bg-transparent px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-ink outline-none transition-colors focus:border-accent"
          />
        </div>

        {state && "error" in state ? (
          <p role="alert" className="font-sans text-sm text-red-700">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-accent px-4 py-3 font-sans text-sm text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Verifying…" : "Verify and continue"}
        </button>
      </form>

      <p className="font-sans text-xs text-ink-subtle">
        Prefer a link? The same email has a one-tap sign-in link that works on
        any device too.
      </p>
    </div>
  );
}
