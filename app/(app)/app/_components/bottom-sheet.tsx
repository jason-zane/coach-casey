"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
};

/**
 * Bottom-anchored floating card with symmetric fade+rise enter/exit. Lives
 * in the lower portion of the screen (thumb reach), floats over the thread
 * with a plain dark overlay that works in both light and dark modes, no
 * blur, since blur inverts awkwardly in dark mode.
 */
export function BottomSheet({ open, onClose, ariaLabel, children }: Props) {
  const [render, setRender] = useState(open);
  const [exiting, setExiting] = useState(false);

  // Sync mount/unmount to the `open` prop, with a 220ms exit animation
  // window so the card fades back out rather than disappearing instantly.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRender(true);
      setExiting(false);
      return;
    }
    if (!render) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExiting(true);
    const id = setTimeout(() => {
      setRender(false);
      setExiting(false);
    }, 220);
    return () => clearTimeout(id);
  }, [open, render]);

  if (!render) return null;

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal aria-label={ariaLabel}>
      <div
        className={`absolute inset-0 bg-black/55 ${exiting ? "overlay-out" : "overlay-in"}`}
        onClick={onClose}
      />
      <div
        className={`absolute left-0 right-0 mx-auto w-[min(92vw,420px)] bg-paper border border-rule/60 rounded-[20px] shadow-2xl flex flex-col max-h-[72vh] overflow-hidden ${
          exiting ? "sheet-up-out" : "sheet-up-in"
        }`}
        style={{
          bottom: "calc(24px + env(safe-area-inset-bottom))",
        }}
      >
        {children}
      </div>
    </div>
  );
}
