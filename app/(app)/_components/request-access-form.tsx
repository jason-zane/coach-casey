"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestAccess } from "@/app/actions/auth";

export function RequestAccessForm() {
  const [state, formAction, isPending] = useActionState(requestAccess, null);

  if (state && "success" in state) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-4">
          <h1 className="font-serif text-3xl leading-tight text-ink">
            You&rsquo;re on the list.
          </h1>
          <p className="font-sans text-sm leading-relaxed text-ink-muted">
            Thanks for the interest. We&rsquo;ll email you a link to sign up,
            usually within a day.
          </p>
          <p className="font-sans text-sm text-ink-muted">
            <Link
              href="/"
              className="text-accent underline-offset-4 hover:underline"
            >
              Back to the homepage
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-2">
          <h1 className="font-serif text-3xl leading-tight text-ink">
            Request early access.
          </h1>
          <p className="font-sans text-sm leading-relaxed text-ink-muted">
            Coach Casey is invite-only while we&rsquo;re in early access with a
            small group of marathoners. Leave your details and we&rsquo;ll send
            you a link to get started.
          </p>
        </header>

        <form action={formAction} className="space-y-5">
          {/* honeypot: positioned off-screen via inline style (guaranteed to
              apply), no label. Real users never see or fill it; bots do. */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "-9999px",
              width: 1,
              height: 1,
              opacity: 0,
            }}
          />

          <div className="space-y-1.5">
            <label
              htmlFor="name"
              className="block font-sans text-sm text-ink-muted"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              className="w-full rounded-md border border-rule bg-transparent px-3 py-2.5 font-sans text-sm text-ink outline-none transition-colors focus:border-accent"
            />
          </div>

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
              className="w-full rounded-md border border-rule bg-transparent px-3 py-2.5 font-sans text-sm text-ink outline-none transition-colors focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="note"
              className="block font-sans text-sm text-ink-muted"
            >
              What are you training for?{" "}
              <span className="text-ink-subtle">(optional)</span>
            </label>
            <textarea
              id="note"
              name="note"
              rows={3}
              className="w-full resize-none rounded-md border border-rule bg-transparent px-3 py-2.5 font-sans text-sm text-ink outline-none transition-colors focus:border-accent"
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
            {isPending ? "Sending…" : "Request access"}
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
