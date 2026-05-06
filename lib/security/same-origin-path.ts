export function sameOriginPath(
  value: string | undefined,
  fallback: string,
  origin: string,
): string {
  if (!value) return fallback;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
