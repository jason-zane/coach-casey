import { headers } from "next/headers";
import { detectMobilePlatform } from "@/lib/onboarding/steps";
import { InstallClient } from "./_install-client";

export default async function InstallStepPage() {
  const ua = (await headers()).get("user-agent");
  const platform = detectMobilePlatform(ua);

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
          Put me on your home screen
        </p>
        <h1 className="font-serif text-3xl leading-tight text-ink md:text-4xl">
          Coach Casey lives on your home screen.
        </h1>
        <p className="prose-serif text-ink-muted max-w-prose">
          Install me, and you&rsquo;ll get debriefs the moment your runs
          finish. A tap from the home screen, no app store.
        </p>
      </header>

      <InstallClient platform={platform} />
    </div>
  );
}
