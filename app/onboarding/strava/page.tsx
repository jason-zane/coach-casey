import { connectStrava } from "@/app/actions/strava";
import { StravaButton } from "./_strava-button";

const ERROR_COPY: Record<string, string> = {
  not_live: "Strava live mode isn't configured yet. Falling back to the preview fixture.",
  missing_scope:
    "Coach Casey needs access to your activities to work. Try connecting again and keep the activity permission on.",
  exchange_failed:
    "Strava didn't accept the authorization. Give it another go, or try again in a minute.",
  no_code: "Strava didn't return an authorization code. Try connecting again.",
  access_denied:
    "You declined to connect Strava. No problem — hit the button when you're ready.",
};

export default async function StravaStepPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const liveMode =
    process.env.STRAVA_MODE === "live" &&
    Boolean(process.env.STRAVA_CLIENT_ID) &&
    Boolean(process.env.STRAVA_CLIENT_SECRET);
  const devMode =
    process.env.STRAVA_MODE === "dev" &&
    Boolean(process.env.STRAVA_DEV_ACCESS_TOKEN) &&
    Boolean(process.env.STRAVA_DEV_REFRESH_TOKEN);

  const errorKey = params.error;
  const errorMessage = errorKey
    ? (ERROR_COPY[errorKey] ?? `Something went wrong (${errorKey}).`)
    : null;

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <h1 className="font-serif text-3xl leading-tight text-ink md:text-4xl">
          Now the setup.
        </h1>
        <p className="prose-serif text-ink-muted max-w-prose">
          Three or four minutes. Starts with Strava so I can see what
          you&rsquo;ve been running. The rest is a few short questions so I
          can tune in from the first run.
        </p>
      </header>

      {errorMessage ? (
        <div
          role="alert"
          className="rounded-md border border-rule-strong bg-surface px-4 py-3 font-sans text-sm text-ink"
        >
          {errorMessage}
        </div>
      ) : null}

      <form action={connectStrava}>
        <StravaButton />
      </form>

      <p className="font-mono text-xs text-ink-subtle">
        {liveMode
          ? "Connected to real Strava. You'll authorize on Strava and be sent back."
          : devMode
            ? "Dev mode: connecting directly with your Strava access token. Real activities, no OAuth."
            : "Preview mode: a sample 10-week block will be loaded for the validation step. Set STRAVA_MODE=dev with your personal Strava tokens to pull your real activities without the OAuth dance."}
      </p>

      <aside className="border-t border-rule/60 pt-6 space-y-2">
        <h2 className="font-sans text-sm font-medium text-ink">
          What Coach Casey does with it
        </h2>
        <ul className="font-sans text-sm text-ink-muted space-y-1.5 list-disc pl-4">
          <li>Reads each run and sends a short debrief after it finishes.</li>
          <li>Remembers what&rsquo;s happened, so the next read is sharper.</li>
          <li>Never posts back, never changes anything on your Strava.</li>
        </ul>
      </aside>
    </div>
  );
}

