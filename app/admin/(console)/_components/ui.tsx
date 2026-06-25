import Link from "next/link";
import type { ReactNode } from "react";

/** Page header: eyebrow + serif title + optional lede and right-aligned slot. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  backHref,
  backLabel,
}: {
  eyebrow?: string;
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="mb-8 space-y-2">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle transition-colors hover:text-ink-muted"
        >
          <span aria-hidden>‹</span>
          <span>{backLabel ?? "Back"}</span>
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          {eyebrow && (
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
              {eyebrow}
            </p>
          )}
          <h1
            className="text-[30px] leading-tight font-medium text-ink"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {title}
          </h1>
          {lede && (
            <p className="max-w-[60ch] text-[13.5px] leading-[1.55] text-ink-muted">
              {lede}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A labelled metric tile. Optional href turns the whole tile into a link. */
export function StatTile({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  tone?: "default" | "alert";
}) {
  const inner = (
    <div
      className={`rounded-md border bg-surface p-4 transition-colors ${
        href ? "hover:border-rule-strong" : ""
      } ${tone === "alert" ? "border-red-200" : "border-rule"}`}
      title={hint}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
        {label}
      </div>
      <div
        className={`mt-1.5 font-serif text-[26px] leading-none ${
          tone === "alert" ? "text-red-700" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/** Section wrapper with a mono uppercase heading and optional right slot. */
export function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Card surface for grouped detail. */
export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-md border border-rule bg-surface p-5 ${className ?? ""}`}
    >
      {title && (
        <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

/** Definition row used inside Card for key/value detail. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-subtle">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-[13px] text-ink">{children}</dd>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.14em]">
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 align-top ${className ?? ""}`}>{children}</td>
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-rule">
      <table className="w-full font-sans text-[12px] text-ink">{children}</table>
    </div>
  );
}

/** Small status pill. */
export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "accent";
}) {
  const tones: Record<string, string> = {
    neutral: "border-rule text-ink-subtle",
    good: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    bad: "border-red-200 bg-red-50 text-red-700",
    accent: "border-accent/30 bg-accent/10 text-ink",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

// --- date helpers (shared across console pages) ---------------------------

export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

export function shortDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeDays(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
