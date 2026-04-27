import { StepHeader } from "@/app/onboarding/_components/form";
import { InjuryForm } from "./_injury-form";

export default function InjuryPage() {
  return (
    <div className="space-y-10">
      <StepHeader
        eyebrow="One more thing"
        title="Anything physical I should know about?"
        description={
          <>
            A niggle, an old injury, something you&rsquo;re managing. Anything
            that shapes how you&rsquo;re running right now. You know your body
            better than I do, this is just context.
          </>
        }
      />
      <InjuryForm />
    </div>
  );
}
