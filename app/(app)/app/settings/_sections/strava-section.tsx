import Link from "next/link";
import {
  loadStravaBlurbEnabled,
  loadStravaConnection,
} from "@/lib/athlete/page-data";
import { disconnectStrava, setStravaBlurbEnabled } from "@/app/actions/strava";
import { isLiveMode } from "@/lib/strava/client";
import { scopeHasActivityWrite } from "@/lib/strava/blurb-description";
import { DisconnectStravaButton } from "../_disconnect-button";
import { StravaBlurbToggle } from "../_blurb-toggle";
import { Field, Section } from "./section-shell";

export async function StravaSection({ athleteId }: { athleteId: string }) {
  const [conn, blurbEnabled] = await Promise.all([
    loadStravaConnection(athleteId),
    loadStravaBlurbEnabled(athleteId),
  ]);
  const hasWriteScope = scopeHasActivityWrite(conn.scope);
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

          {!conn.isMock && (
            <div className="border-t border-rule/60 pt-5 mt-3 space-y-2">
              <Field label="Verdicts">
                <span className="text-ink">
                  {hasWriteScope
                    ? blurbEnabled
                      ? "On"
                      : "Off"
                    : "Needs reconnect"}
                </span>
              </Field>
              <p className="text-[13px] leading-[1.55] text-ink-muted">
                After each debrief, Casey can add a one-line verdict to the
                bottom of that run&apos;s description on Strava, signed
                &ldquo;coached by Coach Casey&rdquo;. Anything you write there
                stays; the line sits below it. Anyone who can see the run on
                Strava will see the line.
              </p>
              {hasWriteScope ? (
                <div className="pt-1">
                  <StravaBlurbToggle
                    enabled={blurbEnabled}
                    action={setStravaBlurbEnabled}
                  />
                </div>
              ) : (
                <>
                  <p className="text-[13px] leading-[1.55] text-ink-muted">
                    Your current connection predates the Strava permission
                    this needs. Reconnect to grant it; reading your runs keeps
                    working either way.
                  </p>
                  {isLiveMode() ? (
                    <div className="pt-1">
                      <a
                        href="/api/strava/authorize"
                        className="inline-flex items-center h-9 px-3 rounded-[6px] border border-rule text-ink text-[13px] font-medium hover:bg-rule/40 transition-colors duration-150"
                      >
                        Reconnect Strava
                      </a>
                    </div>
                  ) : (
                    <p className="text-[12px] leading-[1.5] text-ink-subtle">
                      Reconnecting needs live Strava mode.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

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
