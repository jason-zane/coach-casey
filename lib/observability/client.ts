/**
 * Client-side error reporter. Sent from the error boundaries so client render
 * failures (which never reach the server-side onRequestError hook) still land
 * in error_events for the admin dashboard. Best-effort and silent.
 */
export function reportClientError(error: {
  message: string;
  digest?: string;
  stack?: string;
}): void {
  try {
    void fetch("/api/observability/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest ?? null,
        stack: error.stack ?? null,
        path: typeof window !== "undefined" ? window.location.pathname : null,
      }),
      keepalive: true,
    });
  } catch {
    // Reporting must never break the error UI.
  }
}
