export type ChatRateBucket = { count: number; resetAt: number };

export const MAX_CHAT_REQUEST_BYTES = 16 * 1024;
export const MAX_CHAT_BODY_CHARS = 4_000;
export const CHAT_RATE_WINDOW_MS = 60 * 1000;
export const CHAT_RATE_LIMIT = 20;
export const MEMORY_CONTENT_MAX_CHARS = 1_000;
export const MEMORY_TAG_LIMIT = 8;
export const MEMORY_TAG_MAX_CHARS = 40;

export class PayloadTooLargeError extends Error {}

export function isDeclaredPayloadTooLarge(value: string | null): boolean {
  const declaredLength = Number(value ?? 0);
  return Number.isFinite(declaredLength) && declaredLength > MAX_CHAT_REQUEST_BYTES;
}

export function checkChatRateLimit(
  athleteId: string,
  buckets: Map<string, ChatRateBucket>,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const existing = buckets.get(athleteId);
  if (!existing || existing.resetAt <= now) {
    buckets.set(athleteId, { count: 1, resetAt: now + CHAT_RATE_WINDOW_MS });
    return { ok: true };
  }

  if (existing.count >= CHAT_RATE_LIMIT) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return { ok: true };
}

export function cleanMemoryContent(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MEMORY_CONTENT_MAX_CHARS);
}

export function cleanMemoryTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(cleanMemoryTag)
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, MEMORY_TAG_LIMIT);
}

export function cleanMemoryTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().toLowerCase().slice(0, MEMORY_TAG_MAX_CHARS);
  return tag.length > 0 ? tag : null;
}
