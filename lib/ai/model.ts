import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { gateway } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/**
 * Resolve the chat model from the environment so self-hosters can bring their
 * own provider + key. Defaults preserve the original behavior (OpenAI
 * gpt-4.1-mini), so an existing deployment needs no new env vars.
 *
 *   AI_PROVIDER  "openai" (default) | "anthropic" | "gateway" | "openrouter"
 *   MODEL_ID     provider-specific model id (optional)
 *
 * The matching server-side key must be set: OPENAI_API_KEY,
 * ANTHROPIC_API_KEY, AI_GATEWAY_API_KEY, or OPENROUTER_API_KEY.
 *
 * Model id shapes differ between native and aggregator providers: native
 * Anthropic is "claude-sonnet-4-6" (dashes), while the gateway and OpenRouter
 * namespace and dot the same model as "anthropic/claude-sonnet-4.6". Pick a
 * TOOL-CAPABLE model; the agent is tool calls or nothing.
 */
export function getChatModel() {
  // `||` (not `??`) so an empty-string env var (e.g. MODEL_ID= in .env)
  // falls back to the default instead of being passed through as "".
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  const modelId = process.env.MODEL_ID || "";

  switch (provider) {
    case "openai":
      return openai(modelId || "gpt-4.1-mini");
    case "anthropic":
      // Overridable via MODEL_ID, e.g. claude-opus-4-8 / claude-haiku-4-5.
      return anthropic(modelId || "claude-sonnet-4-6");
    case "gateway":
      // Vercel AI Gateway: one AI_GATEWAY_API_KEY, models addressed as
      // "creator/model". Works on and off Vercel hosting.
      return gateway(modelId || "openai/gpt-4.1-mini");
    case "openrouter":
      // OpenRouter: same "creator/model" addressing, OPENROUTER_API_KEY.
      return createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
      }).chat(modelId || "openai/gpt-4.1-mini");
    default:
      throw new Error(
        `Unsupported AI_PROVIDER "${provider}". Use "openai", "anthropic", "gateway", or "openrouter".`,
      );
  }
}
