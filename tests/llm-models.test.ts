import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseModelChain,
  runWithFallback,
  MODEL_REGISTRY,
  MODELS,
  PRIMARY_MODEL,
} from "../lib/llm/anthropic.ts";

// ---------------------------------------------------------------------------
// parseModelChain — the LLM_MODELS allowlist gate

test("parseModelChain: unset or empty falls back to the default model", () => {
  assert.deepEqual(parseModelChain(undefined), ["deepseek/deepseek-v4-flash"]);
  assert.deepEqual(parseModelChain(""), ["deepseek/deepseek-v4-flash"]);
  assert.deepEqual(parseModelChain("  , ,"), ["deepseek/deepseek-v4-flash"]);
});

test("parseModelChain: parses an ordered list and trims whitespace", () => {
  assert.deepEqual(
    parseModelChain(" deepseek/deepseek-v4-flash , anthropic/claude-haiku-4.5 "),
    ["deepseek/deepseek-v4-flash", "anthropic/claude-haiku-4.5"],
  );
});

test("parseModelChain: rejects a model not in the registry", () => {
  assert.throws(() => parseModelChain("openai/gpt-4.1"), /unsupported model/i);
  assert.throws(
    () => parseModelChain("deepseek/deepseek-v4-flash,bogus/model"),
    /bogus\/model/,
  );
});

test("every registry entry is a valid one-model chain", () => {
  for (const slug of Object.keys(MODEL_REGISTRY)) {
    assert.deepEqual(parseModelChain(slug), [slug]);
  }
});

test("MODELS defaults every surface to the primary model", () => {
  for (const m of Object.values(MODELS)) assert.equal(m, PRIMARY_MODEL);
});

// ---------------------------------------------------------------------------
// runWithFallback — ordered fallback policy

test("runWithFallback: returns the first success without trying the rest", async () => {
  const tried: string[] = [];
  const out = await runWithFallback(["a", "b"], async (m) => {
    tried.push(m);
    return m;
  });
  assert.equal(out, "a");
  assert.deepEqual(tried, ["a"]);
});

test("runWithFallback: falls through to the next model on a transient (5xx) error", async () => {
  const tried: string[] = [];
  const out = await runWithFallback(["a", "b"], async (m) => {
    tried.push(m);
    if (m === "a") throw Object.assign(new Error("overloaded"), { status: 503 });
    return m;
  });
  assert.equal(out, "b");
  assert.deepEqual(tried, ["a", "b"]);
});

test("runWithFallback: a 429 is transient", async () => {
  const out = await runWithFallback(["a", "b"], async (m) => {
    if (m === "a") throw Object.assign(new Error("rate limited"), { status: 429 });
    return m;
  });
  assert.equal(out, "b");
});

test("runWithFallback: rethrows a non-transient (4xx) error WITHOUT falling back", async () => {
  const tried: string[] = [];
  await assert.rejects(
    runWithFallback(["a", "b"], async (m) => {
      tried.push(m);
      throw Object.assign(new Error("bad request"), { status: 400 });
    }),
    /bad request/,
  );
  assert.deepEqual(tried, ["a"], "must not waste a fallback on a real bug");
});

test("runWithFallback: rethrows the last error when every model transiently fails", async () => {
  await assert.rejects(
    runWithFallback(["a", "b"], async (m) => {
      throw Object.assign(new Error(`down-${m}`), { status: 500 });
    }),
    /down-b/,
  );
});

test("runWithFallback: an error with no status (network) is treated as transient", async () => {
  const out = await runWithFallback(["a", "b"], async (m) => {
    if (m === "a") throw new Error("ECONNRESET");
    return m;
  });
  assert.equal(out, "b");
});
