"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signInWithEmail, signInWithGoogle } from "@/app/actions/auth";
import { GoogleIcon } from "@/app/(app)/_components/google-icon";

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState(signInWithEmail, null);
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-10">
        <header className="space-y-2">
          <h1 className="font-serif text-3xl leading-tight text-ink">
            Welcome back.
          </h1>
          <p className="font-sans text-sm text-ink-muted">
            Sign in to pick up where you left off.
          </p>
        </header>

        <form action={signInWithGoogle}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-md border border-rule px-4 py-3 font-sans text-sm text-ink transition-colors hover:bg-ink/5"
          >
            <GoogleIcon className="h-5 w-5" />
            Continue with Google
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <div className="w-full border-t rule" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-paper px-3 font-mono text-xs uppercase tracking-wide text-ink-subtle">
              Or
            </span>
          </div>
        </div>

        <form action={formAction} className="space-y-5">
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
              className="w-full rounded-md border border-rule bg-transparent px-3 py-2 font-sans text-sm text-ink outline-none transition-colors focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block font-sans text-sm text-ink-muted"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-rule bg-transparent px-3 py-2 font-sans text-sm text-ink outline-none transition-colors focus:border-accent"
            />
          </div>

          {(state && "error" in state) || urlError ? (
            <p role="alert" className="font-sans text-sm text-red-700">
              {state && "error" in state
                ? state.error
                : "Something went wrong. Please try again."}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-md bg-accent px-4 py-3 font-sans text-sm text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center font-sans text-sm text-ink-muted">
          New here?{" "}
          <Link
            href="/signup"
            className="text-accent underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
