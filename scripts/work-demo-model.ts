import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

/** Explicit model-only configuration. Never imports application/FHIR settings. */
export function loadWorkModel(options: { envFile?: string; env?: Record<string, string | undefined> } = {}) {
  const environment = options.env ?? process.env;
  const file = options.envFile ? parse(readFileSync(options.envFile)) : {};
  const setting = (name: string) => environment[name] || file[name];
  const provider = (setting("AI_PROVIDER") || "openai").toLowerCase();
  const modelId = setting("MODEL_ID") || (provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-4.1-mini");
  if (!/^[a-zA-Z0-9._:/-]{1,180}$/.test(modelId)) throw new Error("Invalid lab model ID.");
  if (provider === "anthropic") {
    const apiKey = setting("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("Agent mode requires an Anthropic API key.");
    return { model: createAnthropic({ apiKey, baseURL: "https://api.anthropic.com/v1" })(modelId), modelLabel: `anthropic / ${modelId}` };
  }
  if (provider === "openai") {
    const apiKey = setting("OPENAI_API_KEY");
    if (!apiKey) throw new Error("Agent mode requires an OpenAI API key.");
    return { model: createOpenAI({ apiKey, baseURL: "https://api.openai.com/v1" })(modelId), modelLabel: `openai / ${modelId}` };
  }
  throw new Error("The local Work Lab supports direct anthropic or openai agent mode.");
}
