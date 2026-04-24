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
