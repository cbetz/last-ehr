import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWorkModel } from "./work-demo-model";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("explicit Work Lab provider configuration", () => {
  it("requires a real direct provider credential and never falls back to scripted", () => {
    expect(() => loadWorkModel({ env: {} })).toThrow();
    expect(() => loadWorkModel({ env: { AI_PROVIDER: "scripted", OPENAI_API_KEY: "unused" } })).toThrow();
    expect(() => loadWorkModel({ env: { AI_PROVIDER: "anthropic" } })).toThrow();
  });

  it("uses a configured direct provider/model without exposing the key in its label", () => {
    const configuration = loadWorkModel({ env: { AI_PROVIDER: "anthropic", MODEL_ID: "test-model", ANTHROPIC_API_KEY: "private-test-key" } });
    expect(configuration.model.modelId).toBe("test-model");
    expect(configuration.modelLabel).toBe("anthropic / test-model");
    expect(configuration.modelLabel).not.toContain("private-test-key");
  });

  it("reads only model settings from the explicit file without mutating process or FHIR settings", () => {
    const directory = mkdtempSync(join(tmpdir(), "last-model-config-"));
    const path = join(directory, "model.env");
    const before = { ...process.env };
    try {
      writeFileSync(path, "AI_PROVIDER=anthropic\nMODEL_ID=file-model\nANTHROPIC_API_KEY=test-key\nHAPI_BASE_URL=https://remote.invalid/fhir\nANTHROPIC_BASE_URL=https://remote.invalid\n");
      const configuration = loadWorkModel({ envFile: path, env: { MODEL_ID: "environment-model" } });
      expect(configuration.model.modelId).toBe("environment-model");
      expect(configuration.model.provider).toContain("anthropic");
      expect(process.env).toEqual(before);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.each([
    { provider: "openai", url: "https://api.openai.com/v1/responses", keyName: "OPENAI_API_KEY", header: "authorization", value: "Bearer local-test-key" },
    { provider: "anthropic", url: "https://api.anthropic.com/v1/messages", keyName: "ANTHROPIC_API_KEY", header: "x-api-key", value: "local-test-key" },
  ])("pins the $provider request and credential to its official endpoint despite ambient overrides", async ({ provider, url, keyName, header, value }) => {
    vi.stubEnv("OPENAI_BASE_URL", "https://redirect.invalid/openai");
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://redirect.invalid/anthropic");
    // Intercept every request. The intentional local error ends generation
    // without live network traffic or a dependency on provider response schemas.
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: { message: "Local endpoint test." } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const configuration = loadWorkModel({ env: { AI_PROVIDER: provider, MODEL_ID: "test-model", [keyName]: "local-test-key" } });
    const prompt = "Review the invented synthetic result only.";

    await expect(generateText({ model: configuration.model, prompt, maxRetries: 0 })).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0];
    expect(input instanceof Request ? input.url : String(input)).toBe(url);
    expect(new Headers(init?.headers).get(header)).toBe(value);
    expect(String(init?.body)).toContain(prompt);
    expect(String(init?.body)).not.toContain("redirect.invalid");
  });
});
