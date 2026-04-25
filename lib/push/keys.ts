import "server-only";

/**
 * VAPID configuration. Two keys: a public key (sent to the browser as
 * `applicationServerKey` for `pushManager.subscribe`) and a private key
 * (signs the JWT on the server when sending). The subject is a `mailto:` URI
 * the push service uses to contact us if our key behaves badly.
 *
 * Generate keys once with:
 *   npx web-push generate-vapid-keys
 *
 * Store both as Vercel env vars. The public key is also exposed via
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY for the client subscribe flow.
 */

export type VapidConfig = {
  subject: string;
  publicKey: string;
  privateKey: string;
};

let cached: VapidConfig | null = null;

export function getVapidConfig(): VapidConfig | null {
  if (cached) return cached;

  const subject =
    process.env.VAPID_SUBJECT ?? "mailto:hello@coachcasey.example";
  const publicKey =
    process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) return null;

  cached = { subject, publicKey, privateKey };
  return cached;
}

export function isPushConfigured(): boolean {
  return getVapidConfig() !== null;
}
