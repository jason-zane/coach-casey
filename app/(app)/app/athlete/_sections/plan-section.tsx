import Link from "next/link";
import { type ActivePlan, loadActivePlan } from "@/lib/athlete/page-data";
import { Field, Section } from "./section-shell";

export async function PlanSection({ athleteId }: { athleteId: string }) {
  const plan = await loadActivePlan(athleteId);
  return (
    <Section title="Training plan">
      <PlanSummary plan={plan} />
    </Section>
  );
}

function PlanSummary({ plan }: { plan: ActivePlan | null }) {
  if (!plan) {
    return (
      <>
        <p className="text-[13px] leading-[1.55] text-ink-muted">
          No plan on file. Coach Casey works without one, but with a plan, the
          interpretation gets sharper, what was today supposed to be? Did the
          run match?
        </p>
        <div className="pt-3">
          <Link
            href="/app/athlete/plan"
            className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
          >
            Add a plan
          </Link>
        </div>
      </>
    );
  }

  const sourceLabel =
    plan.source === "image"
      ? "Screenshot"
      : plan.source === "pdf"
        ? "PDF"
        : "Pasted text";
  const filenameLabel = plan.sourceFilename
    ? ` (${plan.sourceFilename})`
    : "";
  const ageLabel =
    plan.ageDays === 0
      ? "Today"
      : plan.ageDays === 1
        ? "1 day ago"
        : plan.ageDays < 7
          ? `${plan.ageDays} days ago`
          : plan.ageDays < 14
            ? "About a week ago"
            : `${Math.floor(plan.ageDays / 7)} weeks ago`;
  const stale = plan.ageDays >= 14;

  return (
    <>
      <Field label="Source">
        <span className="text-ink">
          {sourceLabel}
          <span className="text-ink-subtle">{filenameLabel}</span>
        </span>
      </Field>
      <Field label="Uploaded">
        <span className="text-ink">{ageLabel}</span>
      </Field>
      {stale && (
        <p className="text-[13px] leading-[1.55] text-ink-muted pt-2">
          Your plan is more than two weeks old. If you&rsquo;re into a new
          block, upload the latest so I&rsquo;m reading you against the right
          targets.
        </p>
      )}
      <details className="pt-2">
        <summary className="text-[13px] text-ink-muted cursor-pointer hover:text-ink">
          View current plan text
        </summary>
        <pre className="mt-3 max-h-[260px] overflow-auto rounded-md border border-rule bg-surface p-3 text-[12px] leading-[1.55] text-ink whitespace-pre-wrap font-mono">
          {plan.rawText}
        </pre>
      </details>
      <div className="pt-3">
        <Link
          href="/app/athlete/plan"
          className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
        >
          Update plan
        </Link>
      </div>
    </>
  );
}
