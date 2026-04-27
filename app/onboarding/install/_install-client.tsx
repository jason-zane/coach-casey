"use client";

import { useEffect, useState, useTransition } from "react";
import type { MobilePlatform } from "@/lib/onboarding/steps";
import { markInstalledAndAdvance, skipInstall } from "@/app/actions/install";
import {
  GhostButton,
  PrimaryButton,
} from "@/app/onboarding/_components/form";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallClient({ platform }: { platform: MobilePlatform }) {
  const [deferred, setDeferred] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function triggerNativeInstall() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === "accepted") {
      setInstalled(true);
      startTransition(async () => {
        await markInstalledAndAdvance();
      });
    }
  }

  function assumeInstalled() {
    startTransition(async () => {
      await markInstalledAndAdvance();
    });
  }

  function skip() {
    startTransition(async () => {
      await skipInstall();
    });
  }

  return (
    <div className="space-y-8">
      {renderInstructions(platform, Boolean(deferred))}

      <div className="flex flex-wrap items-center gap-4">
        {platform === "android-chrome" && deferred ? (
          <PrimaryButton
            type="button"
            onClick={triggerNativeInstall}
            loading={pending}
            loadingLabel="Installing\u2026"
          >
            Install
          </PrimaryButton>
        ) : platform === "ios-safari" ? (
          <PrimaryButton
            type="button"
            onClick={assumeInstalled}
            loading={pending}
            loadingLabel="Continuing\u2026"
          >
            I&rsquo;ve added it
          </PrimaryButton>
        ) : null}

        <GhostButton type="button" onClick={skip} disabled={pending}>
          {platform === "ios-chrome" || platform === "ios-firefox"
            ? "Skip for now"
            : "Not now"}
        </GhostButton>
      </div>

      {installed ? (
        <p className="font-sans text-sm text-ink-muted">Nice. Continuing.</p>
      ) : null}
    </div>
  );
}

function renderInstructions(platform: MobilePlatform, hasNative: boolean) {
  switch (platform) {
    case "ios-safari":
      return <IOSSafariInstructions />;
    case "ios-chrome":
      return <IOSChromeInstructions />;
    case "ios-firefox":
      return <IOSFirefoxInstructions />;
    case "ios-other":
      return <IOSGenericInstructions />;
    case "android-chrome":
      return <AndroidChromeInstructions hasNative={hasNative} />;
    case "android-other":
      return <AndroidOtherInstructions />;
    case "desktop":
    default:
      return <DesktopInstructions />;
  }
}

function IOSSafariInstructions() {
  return (
    <ol className="space-y-3 font-sans text-sm text-ink">
      <li className="flex gap-3">
        <span className="font-mono text-ink-subtle w-5">1.</span>
        <span>
          Tap the <strong>Share</strong> icon in Safari&rsquo;s toolbar (the
          square with an arrow).
        </span>
      </li>
      <li className="flex gap-3">
        <span className="font-mono text-ink-subtle w-5">2.</span>
        <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
      </li>
      <li className="flex gap-3">
        <span className="font-mono text-ink-subtle w-5">3.</span>
        <span>Tap <strong>Add</strong>. Then come back and continue.</span>
      </li>
    </ol>
  );
}

function IOSChromeInstructions() {
  return (
    <div className="space-y-4 font-sans text-sm text-ink">
      <ol className="space-y-3">
        <li className="flex gap-3">
          <span className="font-mono text-ink-subtle w-5">1.</span>
          <span>
            Tap the <strong>Share</strong> icon (in Chrome&rsquo;s address bar
            or the bottom menu).
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-ink-subtle w-5">2.</span>
          <span>
            Scroll down and tap <strong>Add to Home Screen</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-ink-subtle w-5">3.</span>
          <span>
            Tap <strong>Add</strong>. Then come back here and continue.
          </span>
        </li>
      </ol>
      <p className="text-ink-subtle text-xs">
        If you want push notifications down the line, opening in Safari first
        gives the fullest install. Either works for now.
      </p>
    </div>
  );
}

function IOSFirefoxInstructions() {
  return (
    <div className="space-y-4 font-sans text-sm text-ink">
      <ol className="space-y-3">
        <li className="flex gap-3">
          <span className="font-mono text-ink-subtle w-5">1.</span>
          <span>
            Tap Firefox&rsquo;s <strong>menu</strong> (three lines, bottom
            right), then <strong>Share</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-ink-subtle w-5">2.</span>
          <span>
            Scroll the share sheet and tap <strong>Add to Home Screen</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-ink-subtle w-5">3.</span>
          <span>
            Tap <strong>Add</strong>. Then come back and continue.
          </span>
        </li>
      </ol>
      <p className="text-ink-subtle text-xs">
        If you don&rsquo;t see Add to Home Screen, open this page in Safari
        instead.
      </p>
      <div>
        <CopyLinkButton />
      </div>
    </div>
  );
}

function IOSGenericInstructions() {
  return (
    <div className="space-y-4 font-sans text-sm text-ink">
      <ol className="space-y-3">
        <li className="flex gap-3">
          <span className="font-mono text-ink-subtle w-5">1.</span>
          <span>
            Open the browser&rsquo;s <strong>Share</strong> sheet.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-ink-subtle w-5">2.</span>
          <span>
            Scroll and tap <strong>Add to Home Screen</strong>.
          </span>
        </li>
      </ol>
      <p className="text-ink-subtle text-xs">
        If your browser doesn&rsquo;t show that option, open this page in
        Safari.
      </p>
      <div>
        <CopyLinkButton />
      </div>
    </div>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can fail in some embedded contexts; fall back to prompt().
      window.prompt("Copy this link:", window.location.origin);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-2 rounded-md border border-rule px-4 py-2 font-sans text-sm text-ink hover:border-rule-strong"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

function AndroidChromeInstructions({ hasNative }: { hasNative: boolean }) {
  if (hasNative) {
    return (
      <p className="font-sans text-sm text-ink-muted">
        Tap install and confirm in the prompt.
      </p>
    );
  }
  return (
    <ol className="space-y-3 font-sans text-sm text-ink">
      <li className="flex gap-3">
        <span className="font-mono text-ink-subtle w-5">1.</span>
        <span>Open Chrome&rsquo;s menu (the three dots, top right).</span>
      </li>
      <li className="flex gap-3">
        <span className="font-mono text-ink-subtle w-5">2.</span>
        <span>
          Tap <strong>Install app</strong> or{" "}
          <strong>Add to Home screen</strong>.
        </span>
      </li>
      <li className="flex gap-3">
        <span className="font-mono text-ink-subtle w-5">3.</span>
        <span>Confirm and continue.</span>
      </li>
    </ol>
  );
}

function AndroidOtherInstructions() {
  return (
    <div className="space-y-3 font-sans text-sm text-ink">
      <p className="text-ink-muted">
        For the best install experience, open this page in Chrome.
      </p>
      <ol className="space-y-3">
        <li className="flex gap-3">
          <span className="font-mono text-ink-subtle w-5">1.</span>
          <span>Open your browser&rsquo;s menu.</span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-ink-subtle w-5">2.</span>
          <span>
            Tap <strong>Install app</strong> or{" "}
            <strong>Add to Home screen</strong>.
          </span>
        </li>
      </ol>
    </div>
  );
}

function DesktopInstructions() {
  return (
    <p className="font-sans text-sm text-ink-muted">
      Installing is for phones. Skip this step, or come back on your mobile to
      install.
    </p>
  );
}
