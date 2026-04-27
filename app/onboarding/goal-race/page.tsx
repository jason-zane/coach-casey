import { StepHeader } from "@/app/onboarding/_components/form";
import { GoalRaceForm } from "./_goal-race-form";

export default function GoalRacePage() {
  return (
    <div className="space-y-10">
      <StepHeader
        eyebrow="The race on the horizon"
        title="Training toward something?"
        description={
          <>
            If you&rsquo;ve got a race in your calendar, tell me what and when.
            I&rsquo;ll keep it in mind when I read your training.
          </>
        }
      />
      <GoalRaceForm />
    </div>
  );
}
