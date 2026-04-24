"use client";

import { usePathname } from "next/navigation";

/**
 * Keys children by pathname so route changes within the onboarding layout
 * remount the child subtree, triggering the page-enter animation. Gives
 * each step a soft fade-in instead of the default snap.
 */
export function PageFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
