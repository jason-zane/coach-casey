import { type Instrumentation } from "next";

/**
 * Server-side error capture. Next calls this for every unhandled error in a
 * route handler, server component render, or server action. We dynamic-import
 * the capture lib inside the Node branch so the Edge bundle (middleware) never
 * pulls in posthog-node / the Supabase admin client, which are Node-only.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { captureError } = await import("@/lib/observability/capture");
    const source = context.routeType === "action" ? "action" : "route";
    await captureError(err, {
      source,
      route: context.routePath || request.path,
      digest: (err as { digest?: string }).digest ?? null,
      context: {
        method: request.method,
        routeType: context.routeType,
        routerKind: context.routerKind,
      },
    });
  } catch {
    // Never let instrumentation throw.
  }
};
