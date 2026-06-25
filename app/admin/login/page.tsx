"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { requestAdminMagicLink } from "@/app/actions/admin-auth";

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}

function AdminLoginForm() {
  const [state, formAction, isPending] = useActionState(
    requestAdminMagicLink,
    null,
  );
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  const urlErrorMessage =
    urlError === "forbidden"
      ? "That account isn't an admin. Sign in with an allowlisted address."
      : urlError === "auth_failed"
        ? "That link didn't work. Request a fresh one below."
        : null;

  return (
    <div className="flex min-h-svh items-center justify-center bg-paper px-6 py-16 text-ink">
      <div className="w-full max-w-sm space-y-10">
        <header className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-subtle">
            Coach Casey
          </p>
          <h1
            className="text-[30px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Admin
          </h1>
          <p className="font-sans text-[14px] leading-[1.55] text-ink-muted">
            Sign in with a magic link. Enter your admin email and we&rsquo;ll
            send a one-tap link to get you in.
          </p>
        </header>

        {state && "sent" in state ? (
          <div className="space-y-3 rounded-md border border-rule bg-surface p-5">
            <p className="font-serif text-[18px] text-ink">Check your email.</p>
            <p className="font-sans text-[13px] leading-[1.55] text-ink-muted">
              If{" "}
              <span className="font-mono text-[12px] text-ink">
                {state.email}
              </span>{" "}
              is an admin, a sign-in link is on its way. It expires shortly, so
              use it soon.
            </p>
          </div>
        ) : (
          <form action={formAction} className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block font-sans text-[13px] text-ink-muted"
              >
                Admin email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                placeholder="you@example.com"
                className="w-full rounded-md border border-rule bg-surface px-3 py-2.5 font-sans text-[14px] text-ink outline-none transition-colors focus:border-accent"
              />
            </div>

            {(state && "error" in state) || urlErrorMessage ? (
              <p role="alert" className="font-sans text-[13px] text-red-700">
                {state && "error" in state ? state.error : urlErrorMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-md bg-accent px-4 py-3 font-sans text-[14px] text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}

        <p className="text-center font-sans text-[12px] text-ink-subtle">
          <Link href="/" className="underline-offset-4 hover:underline">
            Back to coachcasey.app
          </Link>
        </p>
      </div>
    </div>
  );
}
