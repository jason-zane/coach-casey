import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// Primary model for generation and onboarding per technical-decision-log.
// Using the latest Sonnet — the decision log notes newer-model swaps are routine.
export const SONNET_MODEL = "claude-sonnet-4-6";

// Lighter model for classification and lightweight routing per
// prompts/prompt-engineering-principles.md. Used for the three follow-up
// surfaces (structured pick-from-bank, conversational one-sentence question,
// RPE-branched one-sentence question) where the GOOD voice bar and short
// outputs are within Haiku's range at a fraction of the cost.
export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
