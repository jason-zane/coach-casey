"use client";

import { useEffect, useState, useTransition } from "react";
import type { MobilePlatform } from "@/lib/onboarding/steps";
import {
  completeNotifications,
  sendTestPush,
  skipNotifications,
  subscribePush,
} from "@/app/actions/push";
import {
  GhostButton,
  PrimaryButton,
} from "@/app/onboarding/_components/form";

type Props = {
  platform: MobilePlatform;
  configured: boolean;
  publicKey: string;
};

type Phase =
  | "checking"
  | "unsupported"
  | "ios-needs-install"
  | "ready"
  | "blocked"
  | "subscribing"
  | "subscribed"
  | "error";

/**
 * urlBase64 (URL-safe base64, no padding) → Uint8Array. Required by
 * `pushManager.subscribe`'s `applicationServerKey`. Lifted from the Next 16
 * PWA guide; identical across every implementation.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari predates display-mode and reports via navigator.standalone.
    Boolean((window.navigator as { standalone?: boolean }).standalone)
  );
}

export function NotificationsClient({ platform, configured, publicKey }: Props) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setPhase("unsupported");
        return;
      }
      // iOS only honours web push for installed PWAs (16.4+). If we're on
      // iOS and not in standalone mode, push will silently fail to register.
      const onIOS = platform.startsWith("ios");
      if (onIOS && !isStandalone()) {
        if (!cancelled) setPhase("ios-needs-install");
        return;
      }

      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          // The browser already has a subscription, but the matching row may
          // not exist for the *current* athlete — they could have signed in
          // as a different account, or we may have pruned the row when the
          // push service returned 410. Reconcile by upserting now (the
          // server action is endpoint-keyed and idempotent). If the upsert
          // fails for some reason, fall through to the normal subscribe
          // flow rather than reporting a false-positive subscribed state.
          const serialised = JSON.parse(JSON.stringify(existing)) as {
            endpoint: string;
            keys: { p256dh: string; auth: string };
          };
          const reconcile = await subscribePush(serialised);
          if (!cancelled && reconcile.ok) {
            setPhase("subscribed");
            return;
          }
          if (!cancelled && !reconcile.ok) {
            // Drop the stale browser sub and let the user re-subscribe.
            try {
              await existing.unsubscribe();
            } catch {
              // Best-effort; if unsubscribe itself fails, the user can still
              // hit "Turn on notifications" and the new subscribe call will
              // either reuse or replace.
            }
          }
        }
      } catch (err) {
        console.warn("service worker registration failed", err);
        if (!cancelled) {
          setPhase("error");
          setErrorMessage("Couldn't register the background worker.");
        }
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setPhase("blocked");
        return;
      }
      if (!cancelled) setPhase("ready");
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, [platform]);

  async function turnOn() {
    if (!configured || !publicKey) {
      setErrorMessage("Notifications aren't fully configured on the server yet.");
      setPhase("error");
      return;
    }
    setPhase("subscribing");
    setErrorMessage(null);
    try {
      // Permission must be requested in direct response to a click; doing it
      // inside an awaited callback works on every modern browser.
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setPhase("blocked");
        return;
      }
      if (permission !== "granted") {
        setPhase("ready");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // TS now widens `Uint8Array` to a SharedArrayBuffer-compatible view
        // even though we always allocate a regular ArrayBuffer here. Cast to
        // BufferSource keeps the runtime data identical and satisfies the
        // narrower type expected by PushSubscriptionOptions.
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      // Server actions can't accept the live PushSubscription; serialise it
      // through JSON to flatten the getter properties first.
      const serialised = JSON.parse(JSON.stringify(sub)) as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      const result = await subscribePush(serialised);
      if (!result.ok) {
        setErrorMessage(
          result.reason === "not_configured"
            ? "Notifications aren't fully configured on the server yet."
            : "Couldn't save your subscription.",
        );
        setPhase("error");
        return;
      }

      // Send a real push so the athlete sees the notification land. If they
      // missed the system permission prompt landing, this is the proof it
      // worked. Best-effort.
      try {
        await sendTestPush({
          title: "Coach Casey",
          body: "You'll hear from me when a debrief lands.",
          tag: "welcome-test",
        });
      } catch {
        // Non-fatal — subscription is still saved.
      }
      setPhase("subscribed");
    } catch (err) {
      console.error("push subscribe failed", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Subscription failed.",
      );
      setPhase("error");
    }
  }

  function continueOn() {
    startTransition(async () => {
      await completeNotifications();
    });
  }

  function skip() {
    startTransition(async () => {
      await skipNotifications();
    });
  }

  return (
    <div className="space-y-6">
      {phase === "checking" ? (
        <p className="font-sans text-sm text-ink-muted">Checking your device&hellip;</p>
      ) : null}

      {phase === "unsupported" ? (
        <UnsupportedNotice onSkip={skip} pending={pending} />
      ) : null}

      {phase === "ios-needs-install" ? (
        <IOSNeedsInstallNotice onSkip={skip} pending={pending} />
      ) : null}

      {phase === "ready" || phase === "subscribing" ? (
        <ReadyToTurnOn
          onAccept={turnOn}
          onSkip={skip}
          pending={pending || phase === "subscribing"}
        />
      ) : null}

      {phase === "blocked" ? (
        <BlockedNotice onSkip={skip} pending={pending} />
      ) : null}

      {phase === "subscribed" ? (
        <SubscribedNotice onContinue={continueOn} pending={pending} />
      ) : null}

      {phase === "error" ? (
        <ErrorNotice
          message={errorMessage ?? "Something went wrong."}
          onSkip={skip}
          pending={pending}
        />
      ) : null}
    </div>
  );
}

function ReadyToTurnOn({
  onAccept,
  onSkip,
  pending,
}: {
  onAccept: () => void;
  onSkip: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-6">
      <p className="font-sans text-sm text-ink">
        Two notifications you&rsquo;ll typically get: a debrief after a run,
        and a weekly review on Sundays. Nothing else from me.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <PrimaryButton
          type="button"
          onClick={onAccept}
          loading={pending}
          loadingLabel="Turning on…"
        >
          Turn on notifications
        </PrimaryButton>
        <GhostButton type="button" onClick={onSkip} disabled={pending}>
          Not now
        </GhostButton>
      </div>
    </div>
  );
}

function SubscribedNotice({
  onContinue,
  pending,
}: {
  onContinue: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-6">
      <p className="font-sans text-sm text-ink">
        You should have just felt one. That&rsquo;s the only one I&rsquo;ll send
        without something to say.
      </p>
      <PrimaryButton
        type="button"
        onClick={onContinue}
        loading={pending}
        loadingLabel="Continuing…"
      >
        Continue
      </PrimaryButton>
    </div>
  );
}

function BlockedNotice({
  onSkip,
  pending,
}: {
  onSkip: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-6">
      <p className="font-sans text-sm text-ink">
        Notifications are blocked for this site in your browser settings. You
        can enable them later from your browser&rsquo;s site settings if you
        change your mind.
      </p>
      <PrimaryButton
        type="button"
        onClick={onSkip}
        loading={pending}
        loadingLabel="Continuing…"
      >
        Continue without
      </PrimaryButton>
    </div>
  );
}

function UnsupportedNotice({
  onSkip,
  pending,
}: {
  onSkip: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-6">
      <p className="font-sans text-sm text-ink-muted">
        This browser doesn&rsquo;t support push notifications. Open Coach
        Casey in a recent version of Chrome, Safari, or Firefox to turn them
        on later.
      </p>
      <PrimaryButton
        type="button"
        onClick={onSkip}
        loading={pending}
        loadingLabel="Continuing…"
      >
        Continue
      </PrimaryButton>
    </div>
  );
}

function IOSNeedsInstallNotice({
  onSkip,
  pending,
}: {
  onSkip: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-6">
      <p className="font-sans text-sm text-ink">
        On iPhone, notifications only work once Coach Casey is on your home
        screen. Add it from the previous step (or from Safari&rsquo;s share
        sheet later) and notifications will work from there.
      </p>
      <PrimaryButton
        type="button"
        onClick={onSkip}
        loading={pending}
        loadingLabel="Continuing…"
      >
        Continue
      </PrimaryButton>
    </div>
  );
}

function ErrorNotice({
  message,
  onSkip,
  pending,
}: {
  message: string;
  onSkip: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-6">
      <p className="font-sans text-sm text-ink-muted">{message}</p>
      <PrimaryButton
        type="button"
        onClick={onSkip}
        loading={pending}
        loadingLabel="Continuing…"
      >
        Skip for now
      </PrimaryButton>
    </div>
  );
}
