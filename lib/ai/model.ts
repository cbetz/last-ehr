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
 * The matching server-side key must be set: OPENAI_API_KEY or ANTHROPIC_API_KEY.
 */
export function getChatModel() {
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();

  switch (provider) {
    case "openai":
      return openai(process.env.MODEL_ID ?? "gpt-4.1-mini");
    case "anthropic":
      // Overridable via MODEL_ID, e.g. claude-opus-4-8 / claude-haiku-4-5.
      return anthropic(process.env.MODEL_ID ?? "claude-sonnet-4-6");
    default:
      throw new Error(
        `Unsupported AI_PROVIDER "${provider}". Use "openai" or "anthropic".`,
      );
  }
}
