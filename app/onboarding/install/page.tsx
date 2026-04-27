import { headers } from "next/headers";
import { detectMobilePlatform } from "@/lib/onboarding/steps";
import { StepHeader } from "@/app/onboarding/_components/form";
import { InstallClient } from "./_install-client";

export default async function InstallStepPage() {
  const ua = (await headers()).get("user-agent");
  const platform = detectMobilePlatform(ua);

  return (
    <div className="space-y-10">
      <StepHeader
        eyebrow="Put me on your home screen"
        title="Coach Casey lives on your home screen."
        description={
          <>
            Install me, and you&rsquo;ll get debriefs the moment your runs
            finish. A tap from the home screen, no app store.
          </>
        }
      />

      <InstallClient platform={platform} />
    </div>
  );
}
