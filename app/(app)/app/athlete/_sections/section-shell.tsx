/**
 * Heading primitives for the athlete page. The page now reads as an
 * editorial reflection of what Casey holds, not a settings form, so
 * top-level sections use the serif voice and subsections use a quiet
 * bold-sans label rather than mono uppercase. Field rows inside the
 * editors keep the mono uppercase treatment, that's form chrome and
 * the right register for a label sitting next to an Edit button.
 */

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[22px] sm:text-[24px] leading-tight font-medium text-ink"
      style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.015em" }}
    >
      {children}
    </h2>
  );
}

export function Subsection({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-rule/40 pt-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-ink">{label}</h3>
        {helper && (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
            {helper}
          </span>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px]">
      <span className="text-ink-subtle font-mono text-[11px] uppercase tracking-[0.14em] min-w-[64px]">
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}

