"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { requestAdminMagicLink } from "@/app/actions/admin-auth";
import { CodeEntryForm } from "@/app/(app)/_components/code-entry-form";

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

  // After the code is sent, drop straight into same-tab code entry, exactly
  // like /signin. The email leads with a 6-digit code (and carries the link as
  // a fallback); verifyEmailCode establishes the session and redirects to
  // /admin, where the middleware re-checks the allowlist as the real gate.
  if (state && "sent" in state) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-paper px-6 py-16 text-ink">
        <CodeEntryForm email={state.email} next="/admin" />
      </div>
    );
  }

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
            Enter your admin email and we&rsquo;ll send you a sign-in code. Type
            it back in on the next screen&mdash;or use the link in the same
            email.
          </p>
        </header>

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
              {isPending ? "Sending…" : "Email me a code"}
            </button>
          </form>

        <p className="text-center font-sans text-[12px] text-ink-subtle">
          <Link href="/" className="underline-offset-4 hover:underline">
            Back to coachcasey.app
          </Link>
        </p>
      </div>
    </div>
  );
}
