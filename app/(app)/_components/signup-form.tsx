"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestSignUpLink } from "@/app/actions/auth";
import { CodeEntryForm } from "@/app/(app)/_components/code-entry-form";

export function SignUpForm({ code }: { code: string }) {
  const [state, formAction, isPending] = useActionState(requestSignUpLink, null);

  // After a valid invite + email, we email a 6-digit code (and a link) and drop
  // into same-tab code entry — the reliable path for signing up on a phone and
  // installing the PWA, with no cross-browser link handoff.
  if (state && "sent" in state) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 py-12">
        <CodeEntryForm email={state.email} next="/app" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-10">
        <header className="space-y-2">
          <h1 className="font-serif text-3xl leading-tight text-ink">
            Create your account.
          </h1>
          <p className="font-sans text-sm text-ink-muted">
            Coach Casey works alongside your plan. Always available, gets
            sharper the longer it knows you.
          </p>
        </header>

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="code" value={code} />
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block font-sans text-sm text-ink-muted"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              className="w-full rounded-md border border-rule bg-transparent px-3 py-2.5 font-sans text-sm text-ink outline-none transition-colors focus:border-accent"
            />
            <p className="font-sans text-xs text-ink-subtle">
              We&rsquo;ll email you a 6-digit code (and a link) — no password
              needed.
            </p>
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
            {isPending ? "Sending…" : "Email me a code"}
          </button>
        </form>

        <p className="text-center font-sans text-sm text-ink-muted">
          Already have an account?{" "}
          <Link
            href="/signin"
            className="text-accent underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
