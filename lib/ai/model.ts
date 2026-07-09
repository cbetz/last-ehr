import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

/**
 * Resolve the chat model from the environment so self-hosters can bring their
 * own provider + key. Defaults preserve the original behavior (OpenAI
 * gpt-4.1-mini), so an existing deployment needs no new env vars.
 *
 *   AI_PROVIDER  "openai" (default) | "anthropic"
 *   MODEL_ID     provider-specific model id (optional)
 *
 * The matching server-side key must be set: OPENAI_API_KEY or
 * ANTHROPIC_API_KEY.
 *
 * Provider policy: every provider shipped here must be able to carry a BAA,
 * because deployments of this project head toward real clinical data even
 * though the demo is synthetic-only. OpenAI and Anthropic sign BAAs with
 * zero-retention options for API traffic on qualifying plans. Aggregators
 * that cannot sign a BAA (OpenRouter, as of their current public terms) are
 * deliberately not offered; a multi-model, BAA-capable path via AWS Bedrock
 * is tracked and lands separately. Pick a TOOL-CAPABLE model either way; the
 * agent is tool calls or nothing.
 */
export function getChatModel(overrideModelId?: string) {
  // `||` (not `??`) so an empty-string env var (e.g. MODEL_ID= in .env)
  // falls back to the default instead of being passed through as "".
  // overrideModelId is the demo model picker's ALREADY-ALLOWLISTED choice
  // (see lib/ai/demo-models.ts); it never comes from raw user input.
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  const modelId = overrideModelId || process.env.MODEL_ID || "";

  switch (provider) {
    case "openai":
      return openai(modelId || "gpt-4.1-mini");
    case "anthropic":
      // Overridable via MODEL_ID, e.g. claude-opus-4-8 / claude-haiku-4-5.
      return anthropic(modelId || "claude-sonnet-4-6");
    default:
      throw new Error(
        `Unsupported AI_PROVIDER "${provider}". Use "openai" or "anthropic".`,
      );
  }
}
