"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

const FIELD_BASE =
  "w-full rounded-md border border-rule bg-surface px-3 py-2.5 font-sans text-sm text-ink placeholder:text-ink-subtle outline-none transition-colors focus:border-accent disabled:opacity-50";

export const FieldLabel = ({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: ReactNode;
  hint?: ReactNode;
}) => (
  <label
    htmlFor={htmlFor}
    className="block font-sans text-sm text-ink-muted"
  >
    {children}
    {hint ? (
      <span className="ml-2 text-ink-subtle">{hint}</span>
    ) : null}
  </label>
);

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      {...rest}
      className={`${FIELD_BASE} ${className ?? ""}`.trim()}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      {...rest}
      className={`${FIELD_BASE} resize-none ${className ?? ""}`.trim()}
    />
  );
});

const PRIMARY_BUTTON =
  "rounded-md bg-accent px-5 py-2.5 font-sans text-sm text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50";

const GHOST_BUTTON =
  "font-sans text-sm text-ink-muted underline-offset-4 hover:underline disabled:opacity-50";

type SpinnerSize = "sm" | "md";

function Spinner({ size = "sm" }: { size?: SpinnerSize }) {
  const dim = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <svg
      className={`${dim} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-30"
      />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
        className="opacity-90"
      />
    </svg>
  );
}

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
};

export const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  function PrimaryButton(
    { children, loading, loadingLabel, disabled, className, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        {...rest}
        disabled={disabled || loading}
        className={`${PRIMARY_BUTTON} inline-flex items-center gap-2 ${className ?? ""}`.trim()}
      >
        {loading ? (
          <>
            <Spinner />
            <span>{loadingLabel ?? children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);

type GhostButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

export const GhostButton = forwardRef<HTMLButtonElement, GhostButtonProps>(
  function GhostButton({ children, loading, disabled, className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        {...rest}
        disabled={disabled || loading}
        className={`${GHOST_BUTTON} ${className ?? ""}`.trim()}
      >
        {children}
      </button>
    );
  },
);

export function StepHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <header className="space-y-4">
      {eyebrow ? (
        <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="font-serif text-3xl leading-tight text-ink md:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="prose-serif text-ink-muted max-w-prose">{description}</p>
      ) : null}
    </header>
  );
}

export function StepFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between pt-2 ${className ?? ""}`.trim()}
    >
      {children}
    </div>
  );
}
