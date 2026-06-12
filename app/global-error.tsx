"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/client";

/**
 * Replaces the root layout when it (or something above the segment error
 * boundary) throws, so it must render its own html/body and cannot rely on
 * the app's global styles being present. Inline styles keep it self-contained.
 */
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#faf8f4",
          color: "#1a1a1a",
        }}
      >
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 14, opacity: 0.7, margin: 0, maxWidth: 360 }}>
            Casey has logged the problem. Please try again.
          </p>
          <button
            onClick={() => unstable_retry()}
            style={{
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.2)",
              padding: "8px 20px",
              fontSize: 14,
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
