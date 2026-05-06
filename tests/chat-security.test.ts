import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_RATE_LIMIT,
  CHAT_RATE_WINDOW_MS,
  MAX_CHAT_BODY_CHARS,
  MAX_CHAT_REQUEST_BYTES,
  checkChatRateLimit,
  cleanMemoryContent,
  cleanMemoryTag,
  cleanMemoryTags,
  isDeclaredPayloadTooLarge,
} from "../lib/chat/security.ts";

test("chat request size guard rejects oversized declared bodies", () => {
  assert.equal(isDeclaredPayloadTooLarge(String(MAX_CHAT_REQUEST_BYTES)), false);
  assert.equal(isDeclaredPayloadTooLarge(String(MAX_CHAT_REQUEST_BYTES + 1)), true);
  assert.equal(isDeclaredPayloadTooLarge(null), false);
});

test("chat rate limiter caps requests per athlete per window", () => {
  const buckets = new Map();
  const athleteId = "athlete-1";
  const now = 1_000;

  for (let i = 0; i < CHAT_RATE_LIMIT; i++) {
    assert.deepEqual(checkChatRateLimit(athleteId, buckets, now), { ok: true });
  }

  assert.deepEqual(checkChatRateLimit(athleteId, buckets, now), {
    ok: false,
    retryAfterSeconds: 60,
  });

  assert.deepEqual(
    checkChatRateLimit(athleteId, buckets, now + CHAT_RATE_WINDOW_MS + 1),
    { ok: true },
  );
});

test("memory tool writes are bounded and normalized", () => {
  assert.equal(cleanMemoryContent("  hello  "), "hello");
  assert.equal(cleanMemoryContent("x".repeat(MAX_CHAT_BODY_CHARS)).length, 1_000);
  assert.equal(cleanMemoryTag("  Left Calf  "), "left calf");
  assert.equal(cleanMemoryTag(""), null);
  assert.deepEqual(
    cleanMemoryTags(["  A  ", "", 3, "B", "C", "D", "E", "F", "G", "H", "I"]),
    ["a", "b", "c", "d", "e", "f", "g", "h"],
  );
});
