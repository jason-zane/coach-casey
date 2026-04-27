import { headers } from "next/headers";
import { detectMobilePlatform } from "@/lib/onboarding/steps";
import { isPushConfigured } from "@/lib/push/keys";
import { StepHeader } from "@/app/onboarding/_components/form";
import { NotificationsClient } from "./_notifications-client";

export default async function NotificationsStepPage() {
  const ua = (await headers()).get("user-agent");
  const platform = detectMobilePlatform(ua);
  const configured = isPushConfigured();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <div className="space-y-10">
      <StepHeader
        eyebrow="One ping when it matters"
        title="A short note when a debrief lands."
        description={
          <>
            Finish a run. A few minutes later, your phone buzzes once. Open the
            notification, read the debrief, get on with your day. No stream of
            alerts, no streaks, no nudges. Just the moments that earn it.
          </>
        }
      />

      <NotificationsClient
        platform={platform}
        configured={configured}
        publicKey={publicKey}
      />
    </div>
  );
}
