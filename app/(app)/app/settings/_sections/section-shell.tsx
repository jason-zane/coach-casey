/**
 * Settings-page heading shell. Stays mono-uppercase because settings
 * is form-chrome by nature, the right register for short utility
 * sections (Strava, Data, Account, Legal, Admin). The athlete page
 * uses different heading primitives.
 */

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
        {title}
      </h2>
      <div className="space-y-2 border-t border-rule/60 pt-4">{children}</div>
    </section>
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
