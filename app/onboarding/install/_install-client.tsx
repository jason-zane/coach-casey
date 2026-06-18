"use client";

import { useEffect, useState, useTransition } from "react";
import type { MobilePlatform } from "@/lib/onboarding/steps";
import { markInstalledAndAdvance, skipInstall } from "@/app/actions/install";
import {
  GhostButton,
  PrimaryButton,
} from "@/app/onboarding/_components/form";
import { useAutoAdvance } from "@/app/onboarding/_components/use-auto-advance";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  // Spec: matchMedia "display-mode: standalone" covers Android Chrome,
  // desktop Chrome, and modern iOS Safari PWA installs.
  if (window.matchMedia?.("(display-mode: standalone)")?.matches) return true;
  // Legacy iOS Safari: navigator.standalone is set by webkit. Some older
  // builds don't update display-mode reliably so check both.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export function InstallClient({ platform }: { platform: MobilePlatform }) {
  const [deferred, setDeferred] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [pending, startTransition] = useTransition();
  const [autoAdvancing, setAutoAdvancing] = useState(false);

  // When we detect we're already running inside the installed PWA, the advance
  // is driven through this robust helper rather than a one-shot transition: it
  // re-fires if the tab is backgrounded mid-hand-off, and the Continue button
  // below guarantees a manual way forward.
  const autoAdvance = useAutoAdvance(() => markInstalledAndAdvance(), {
    enabled: autoAdvancing,
  });

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

  // Auto-advance when the athlete is already running inside the installed
  // PWA, opening onboarding from the home-screen icon means the install
  // step is a tautology. Without this, anyone who installed and re-entered
  // onboarding would stare at "add me to your home screen" instructions
  // they've already followed. Mount-only check; standalone-mode doesn't
  // toggle mid-session.
  useEffect(() => {
    if (!isStandalonePwa()) return;
    // Flip into auto-advance mode; useAutoAdvance(enabled: autoAdvancing) drives
    // the actual hand-off and recovers if the tab is backgrounded mid-way.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoAdvancing(true);
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

  if (autoAdvancing) {
    return (
      <div className="space-y-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle breath">
          Already installed, continuing…
        </p>
        <PrimaryButton
          type="button"
          onClick={autoAdvance.run}
          loading={autoAdvance.pending}
          loadingLabel="Continuing…"
        >
          Continue
        </PrimaryButton>
        {autoAdvance.error ? (
          <p className="font-sans text-xs text-ink-muted">
            Tap Continue if it doesn&rsquo;t move on by itself.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {renderInstructions(platform, Boolean(deferred))}

      <div className="flex flex-wrap items-center gap-4">
        {deferred ? (
          // Any browser that fired beforeinstallprompt: desktop Chrome /
          // Edge / Brave, Android Chrome, etc. iOS browsers never fire
          // this so this branch is silently skipped on iOS.
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
            Tap Chrome&rsquo;s <strong>Share</strong> icon (in the address bar
            or the bottom menu).
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-ink-subtle w-5">2.</span>
          <span>
            Scroll and tap <strong>Add to Home Screen</strong>, then{" "}
            <strong>Add</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-ink-subtle w-5">3.</span>
          <span>Open Coach Casey from your home screen, then come back.</span>
        </li>
      </ol>
      <p className="text-ink-subtle text-xs pt-1">
        Safari works the same way (Share → Add to Home Screen). Both end up
        as a real app on your home screen.
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
            Scroll the share sheet and tap <strong>Add to Home Screen</strong>,
            then <strong>Add</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-ink-subtle w-5">3.</span>
          <span>Open Coach Casey from your home screen, then come back.</span>
        </li>
      </ol>
      <p className="text-ink-subtle text-xs pt-1">
        If your Firefox doesn&rsquo;t show <em>Add to Home Screen</em>, copy
        the link and paste in Safari or Chrome.
      </p>
      <CopyLinkButton />
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
            Scroll and tap <strong>Add to Home Screen</strong>, then{" "}
            <strong>Add</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-ink-subtle w-5">3.</span>
          <span>Open Coach Casey from your home screen, then come back.</span>
        </li>
      </ol>
      <p className="text-ink-subtle text-xs pt-1">
        If your browser doesn&rsquo;t show that option, copy the link and try
        in Safari or Chrome.
      </p>
      <CopyLinkButton />
    </div>
  );
}

function CopyLinkButton({ primary = false }: { primary?: boolean } = {}) {
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
      className={
        primary
          ? "inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-accent-ink hover:bg-accent/90"
          : "inline-flex items-center gap-2 rounded-md border border-rule px-4 py-2 font-sans text-sm text-ink hover:border-rule-strong"
      }
    >
      {copied ? "Copied " : "Copy link "}
      <span aria-hidden className="font-mono text-xs opacity-70">↗</span>
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
