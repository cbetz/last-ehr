import { describe, it, expect, vi, afterEach } from "vitest";

import { getChatModel, isScriptedDemoEnabled } from "@/lib/ai/model";

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

  it("resolves bedrock with an explicit model id", () => {
    vi.stubEnv("AI_PROVIDER", "bedrock");
    vi.stubEnv("MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0");
    vi.stubEnv("AWS_REGION", "us-east-1");
    expect(getChatModel().modelId).toBe(
      "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    );
  });

  it("refuses bedrock without MODEL_ID instead of guessing a default", () => {
    vi.stubEnv("AI_PROVIDER", "bedrock");
    vi.stubEnv("MODEL_ID", "");
    expect(() => getChatModel()).toThrow("requires MODEL_ID");
  });

  it("throws on unknown providers", () => {
    vi.stubEnv("AI_PROVIDER", "cohere");
    expect(() => getChatModel()).toThrow('Unsupported AI_PROVIDER "cohere"');
  });

  it("allows the scripted provider only for the explicit local HAPI demo", () => {
    vi.stubEnv("AI_PROVIDER", "scripted");
    vi.stubEnv("LASTEHR_SCRIPTED_DEMO", "true");
    vi.stubEnv("FHIR_BACKEND", "hapi");
    vi.stubEnv("FHIR_BASE_URL", "http://localhost:8080/fhir");

    expect(isScriptedDemoEnabled()).toBe(true);
    expect(getChatModel().modelId).toBe("local-synthetic");
  });

  it("allows the Docker Compose HAPI hostname used by the app container", () => {
    expect(
      isScriptedDemoEnabled({
        ...process.env,
        AI_PROVIDER: "scripted",
        LASTEHR_SCRIPTED_DEMO: "true",
        FHIR_BACKEND: "hapi",
        FHIR_BASE_URL: "http://hapi:8080/fhir",
      }),
    ).toBe(true);
  });

  it("refuses the scripted provider outside an explicitly local HAPI setup", () => {
    vi.stubEnv("AI_PROVIDER", "scripted");
    vi.stubEnv("LASTEHR_SCRIPTED_DEMO", "true");
    vi.stubEnv("FHIR_BACKEND", "medplum");
    vi.stubEnv("FHIR_BASE_URL", "https://example.com/fhir");

    expect(isScriptedDemoEnabled()).toBe(false);
    expect(() => getChatModel()).toThrow("only available for the explicit local HAPI");
  });

  it("requires the local HTTP HAPI endpoint rather than only a local hostname", () => {
    vi.stubEnv("AI_PROVIDER", "scripted");
    vi.stubEnv("LASTEHR_SCRIPTED_DEMO", "true");
    vi.stubEnv("FHIR_BACKEND", "hapi");
    vi.stubEnv("FHIR_BASE_URL", "https://localhost:8080/fhir");

    expect(isScriptedDemoEnabled()).toBe(false);

    vi.stubEnv("FHIR_BASE_URL", "http://localhost:8080/not-fhir");
    expect(isScriptedDemoEnabled()).toBe(false);
  });
});
