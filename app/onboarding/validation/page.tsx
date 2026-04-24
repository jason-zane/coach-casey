import { loadValidationState } from "@/app/actions/validation";
import { ValidationLoop } from "./_validation-loop";

export default async function ValidationPage() {
  const { observations } = await loadValidationState();

  return (
    <div className="space-y-8">
      {/* Intentionally no prose header here. The reading-state page that
          precedes this one lands on the bridge line ("Let's look at a few")
          and cross-fades directly into the first observation. The tiny
          mono-case label exists to orient a returning user who hits the
          page cold, not to re-introduce the moment for a first-timer. */}
      <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
        Observations
      </p>

      <ValidationLoop
        initialObservations={observations.map((o) => ({
          sequenceIdx: o.sequence_idx,
          text: o.observation_text,
          chip: o.response_chip,
          response: o.response_text,
          submitted: Boolean(o.response_chip || o.response_text),
        }))}
      />
    </div>
  );
}
