import { headers } from "next/headers";
import { detectMobilePlatform } from "@/lib/onboarding/steps";
import { isPushConfigured } from "@/lib/push/keys";
import { NotificationsClient } from "./_notifications-client";

export default async function NotificationsStepPage() {
  const ua = (await headers()).get("user-agent");
  const platform = detectMobilePlatform(ua);
  const configured = isPushConfigured();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
          One ping when it matters
        </p>
        <h1 className="font-serif text-3xl leading-tight text-ink md:text-4xl">
          A short note when a debrief lands.
        </h1>
        <p className="prose-serif text-ink-muted max-w-prose">
          Finish a run. A few minutes later, your phone buzzes once. Open the
          notification, read the debrief, get on with your day. No stream of
          alerts, no streaks, no nudges. Just the moments that earn it.
        </p>
      </header>

      <NotificationsClient
        platform={platform}
        configured={configured}
        publicKey={publicKey}
      />
    </div>
  );
}
