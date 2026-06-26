"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestSignUpLink } from "@/app/actions/auth";

export function SignUpForm({ code }: { code: string }) {
  const [state, formAction, isPending] = useActionState(requestSignUpLink, null);

  // After a valid invite + email, we send a magic link that creates the
  // account on click. There's no password to set.
  if (state && "sent" in state) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-4">
          <h1 className="font-serif text-3xl leading-tight text-ink">
            Check your email.
          </h1>
          <p className="font-sans text-sm text-ink-muted">
            We&rsquo;ve sent a one-tap sign-up link to{" "}
            <span className="font-mono text-[13px] text-ink">{state.email}</span>
            . Open it to finish creating your account. It expires shortly, so use
            it soon.
          </p>
        </div>
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
              We&rsquo;ll email you a one-tap link to sign in — no password
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
            {isPending ? "Sending…" : "Email me a sign-up link"}
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
