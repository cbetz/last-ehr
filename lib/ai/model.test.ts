import { describe, it, expect, vi, afterEach } from "vitest";

import { getChatModel } from "@/lib/ai/model";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getChatModel", () => {
  it("defaults to OpenAI gpt-4.1-mini so existing deployments are unchanged", () => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("MODEL_ID", "");
    const model = getChatModel();
    expect(model.modelId).toBe("gpt-4.1-mini");
  });

  it("treats an empty MODEL_ID as unset for every provider", () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("MODEL_ID", "");
    expect(getChatModel().modelId).toBe("claude-sonnet-4-6");
  });

  it("passes MODEL_ID through on the native providers", () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("MODEL_ID", "gpt-5-mini");
    expect(getChatModel().modelId).toBe("gpt-5-mini");
  });

  it("throws on unknown providers", () => {
    vi.stubEnv("AI_PROVIDER", "cohere");
    expect(() => getChatModel()).toThrow('Unsupported AI_PROVIDER "cohere"');
  });
});
