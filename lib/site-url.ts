/* Canonical site origin for metadata, sitemaps, and structured data.
 * NEXT_PUBLIC_APP_URL is set to the LAN address in local dev and is empty
 * in production env files today, so production falls back to the apex. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.coachcasey.app";
