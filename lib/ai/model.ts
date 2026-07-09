import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { bedrock } from "@ai-sdk/amazon-bedrock";

/**
 * Resolve the chat model from the environment so self-hosters can bring their
 * own provider + key. Defaults preserve the original behavior (OpenAI
 * gpt-4.1-mini), so an existing deployment needs no new env vars.
 *
 *   AI_PROVIDER  "openai" (default) | "anthropic" | "bedrock"
 *   MODEL_ID     provider-specific model id (optional; REQUIRED for bedrock)
 *
 * Keys: OPENAI_API_KEY or ANTHROPIC_API_KEY for the native providers;
 * bedrock uses the standard AWS credential env (AWS_ACCESS_KEY_ID,
 * AWS_SECRET_ACCESS_KEY, AWS_REGION).
 *
 * Provider policy: every provider shipped here must be able to carry a BAA,
 * because deployments of this project head toward real clinical data even
 * though the demo is synthetic-only. OpenAI and Anthropic sign BAAs with
 * zero-retention options for API traffic on qualifying plans; Amazon Bedrock
 * is on AWS's HIPAA-eligible services list and serves several model families
 * (Anthropic, Meta, Mistral, Amazon) under one AWS BAA. Aggregators that
 * cannot sign a BAA (OpenRouter, as of their current public terms) are
 * deliberately not offered. Pick a TOOL-CAPABLE model either way; the agent
 * is tool calls or nothing.
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
    case "bedrock":
      // Bedrock model ids are region-prefixed inference profiles (for
      // example us.anthropic.claude-haiku-4-5-20251001-v1:0) whose
      // availability varies by account and region, so there is no safe
      // default to hardcode.
      if (!modelId) {
        throw new Error(
          "AI_PROVIDER=bedrock requires MODEL_ID (a Bedrock model id or inference profile, e.g. us.anthropic.claude-haiku-4-5-20251001-v1:0).",
        );
      }
      return bedrock(modelId);
    default:
      throw new Error(
        `Unsupported AI_PROVIDER "${provider}". Use "openai", "anthropic", or "bedrock".`,
      );
  }
}
