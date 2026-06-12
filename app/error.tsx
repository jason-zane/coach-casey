"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/client";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper px-6 text-center text-ink">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="max-w-sm text-sm text-ink/70">
        That one is on us, not you. Casey has logged the problem. Give it
        another go in a moment.
      </p>
      <button
        onClick={() => unstable_retry()}
        className="rounded-full border border-ink/20 px-5 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
