import Link from "next/link";
import { loadStravaConnection } from "@/lib/athlete/page-data";
import { disconnectStrava } from "@/app/actions/strava";
import { DisconnectStravaButton } from "../_disconnect-button";
import { Field, Section } from "./section-shell";

export async function StravaSection({ athleteId }: { athleteId: string }) {
  const conn = await loadStravaConnection(athleteId);
  return (
    <Section title="Strava">
      {conn.isConnected ? (
        <>
          <Field label="Status">
            <span className="inline-flex items-center gap-2 text-ink">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
              />
              Connected{conn.isMock ? " (mock)" : ""}
            </span>
          </Field>
          {conn.connectedAt && (
            <Field label="Since">
              <span className="text-ink">
                {new Date(conn.connectedAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </Field>
          )}
          <p className="text-[13px] leading-[1.55] text-ink-muted pt-2">
            Coach Casey reads your runs from Strava and keeps debriefs inside
            the app. Disconnect at any time.
          </p>
          <div className="pt-3">
            <DisconnectStravaButton action={disconnectStrava} />
          </div>
          <p className="text-[12px] leading-[1.5] text-ink-subtle pt-1">
            You can also revoke access from{" "}
            <a
              className="underline underline-offset-2 hover:text-ink-muted"
              href="https://www.strava.com/settings/apps"
              target="_blank"
              rel="noopener noreferrer"
            >
              Strava&apos;s authorised apps page
            </a>
            .
          </p>
        </>
      ) : (
        <>
          <Field label="Status">
            <span className="text-ink-muted">Not connected</span>
          </Field>
          <p className="text-[13px] leading-[1.55] text-ink-muted pt-2">
            Connect Strava to let Coach Casey read your runs and write
            debriefs.
          </p>
          <div className="pt-3">
            <Link
              href="/onboarding/strava"
              className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
            >
              Connect Strava
            </Link>
          </div>
        </>
      )}
    </Section>
  );
}
