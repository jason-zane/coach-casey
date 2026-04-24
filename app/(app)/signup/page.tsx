"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpWithEmail, signInWithGoogle } from "@/app/actions/auth";
import { GoogleButton } from "@/app/(app)/_components/google-button";

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState(signUpWithEmail, null);

  // "Check your email" state is only reached when email confirmation is on
  // at the Supabase project level. With it off, signUp redirects straight
  // into onboarding and this branch never renders.
  if (state && "success" in state) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-4">
          <h1 className="font-serif text-3xl leading-tight text-ink">
            Check your email.
          </h1>
          <p className="font-sans text-sm text-ink-muted">
            We&rsquo;ve sent a confirmation link. Open it on this device to
            finish signing up.
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

        <form action={signInWithGoogle}>
          <GoogleButton />
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
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full rounded-md border border-rule bg-transparent px-3 py-2 font-sans text-sm text-ink outline-none transition-colors focus:border-accent"
            />
            <p className="font-sans text-xs text-ink-subtle">
              At least 8 characters.
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
            {isPending ? "Creating account…" : "Create account"}
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
