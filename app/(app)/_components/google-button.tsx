"use client";

import { useFormStatus } from "react-dom";
import { GoogleIcon } from "./google-icon";

export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-3 rounded-md border border-rule px-4 py-3 font-sans text-sm text-ink transition-colors hover:bg-ink/5 disabled:opacity-60"
    >
      {pending ? (
        <Spinner className="h-4 w-4 text-ink-muted" />
      ) : (
        <GoogleIcon className="h-5 w-5" />
      )}
      {pending ? "Taking you to Google\u2026" : label}
    </button>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`${className ?? ""} animate-spin`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-80"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  );
}
