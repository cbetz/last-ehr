import { exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it, vi } from "vitest";

import { loadMcpConfig } from "./config.js";
import { runDoctor } from "./doctor.js";
import { renderInit, sandboxGuide } from "./init.js";
import { createWriteTools } from "./write-tools.js";
import { EPIC_VENDOR_PROFILE } from "./sandbox-profile.js";

const pemPromise = generateKeyPair("RS384", { extractable: true }).then(({ privateKey }) =>
  exportPKCS8(privateKey),
);

describe("sandbox MCP configuration", () => {
  it("stays off without the experimental flag and accepts epic with a key", async () => {
    const pem = await pemPromise;
    expect(() =>
      loadMcpConfig({ LASTEHR_BACKEND: "epic", LASTEHR_CLIENT_ID: "c", LASTEHR_PRIVATE_KEY: pem }),
    ).toThrow(/LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS/);
    const config = loadMcpConfig({
      LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
      LASTEHR_BACKEND: "epic",
      LASTEHR_CLIENT_ID: "client",
      LASTEHR_PRIVATE_KEY: pem,
      LASTEHR_ENCOUNTER: "Encounter/enc-1",
    });
    expect(config.backend).toBe("epic");
    expect(config.sandbox?.profile).toBe("epic");
    expect(JSON.stringify({ backend: config.backend })).not.toContain("BEGIN PRIVATE KEY");
  });

  it("requires Oracle scopes", () => {
    expect(() =>
      loadMcpConfig({
        LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
        LASTEHR_BACKEND: "oracle",
        LASTEHR_CLIENT_ID: "client",
        LASTEHR_PRIVATE_KEY: "not-parsed-yet",
      }),
    ).toThrow(/LASTEHR_SCOPES/);
  });
});

describe("sandbox init", () => {
  it("prints placeholder env and keeps the JSON free of secrets", () => {
    const raw = renderInit("json", "epic");
    const config = JSON.parse(raw);
    expect(config.mcpServers.lastehr.env.LASTEHR_BACKEND).toBe("epic");
    expect(config.mcpServers.lastehr.env.LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS).toBe("1");
    expect(config.mcpServers.lastehr.env.LASTEHR_PRIVATE_KEY_PATH).toBe("<path-to-pkcs8-pem>");
    expect(config.mcpServers.lastehr.env.LASTEHR_MCP_WRITES).toBe("proposal");
    expect(raw).not.toContain("BEGIN PRIVATE KEY");
    expect(sandboxGuide("epic")).toContain("do not support delete");
    expect(sandboxGuide("oracle")).toContain("8331-1");
  });
});

describe("sandbox doctor", () => {
  it("reports kid, granted scopes, and a missing search scope without secrets", async () => {
    const pem = await pemPromise;
    const token = "minted-access-token-do-not-print";
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("jwks")) {
        return new Response(
          JSON.stringify({ keys: [{ kty: "RSA", kid: "lastehr-epic-1", n: "secret-modulus", e: "AQAB" }] }),
          { status: 200 },
        );
      }
      if (url.endsWith("/token")) {
        return new Response(
          JSON.stringify({
            access_token: token,
            expires_in: 300,
            scope: "system/Patient.read system/Observation.write",
          }),
          { status: 200 },
        );
      }
      return new Response("", { status: 403 });
    });
    const config = loadMcpConfig({
      LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
      LASTEHR_BACKEND: "epic",
      LASTEHR_CLIENT_ID: "client",
      LASTEHR_PRIVATE_KEY: pem,
      LASTEHR_KEY_ID: "lastehr-epic-1",
      LASTEHR_JWKS_URL: "https://www.example.test/.well-known/jwks.json",
      LASTEHR_FHIR_BASE_URL: "https://fhir.example.test/R4",
      LASTEHR_TOKEN_URL: "https://auth.example.test/token",
    });
    const report = await runDoctor(config, { fetchFn: fetchFn as typeof globalThis.fetch });
    const text = report.lines.join("\n");
    expect(report.ok).toBe(true);
    expect(text).toContain("Private key loaded");
    expect(text).toContain("JWKS kid matches.");
    expect(text).toContain("Granted scopes: system/Patient.read system/Observation.write.");
    expect(text).toContain("lacks the search scope");
    expect(text).not.toContain(token);
    expect(text).not.toContain(pem);
    expect(text).not.toContain("secret-modulus");
  });
});

describe("sandbox write approval", () => {
  it("refuses an Epic observation before asking for approval when encounter is missing", async () => {
    const decide = vi.fn(async () => "approved" as const);
    const createResource = vi.fn();
    const tools = createWriteTools(
      { search: vi.fn(), searchResources: vi.fn(), createResource },
      decide,
      { vendor: EPIC_VENDOR_PROFILE },
    );
    const tool = tools.find((candidate) => candidate.name === "record_observation");
    const result = await tool?.execute({
      patientId: "p1",
      label: "Heart rate",
      value: 72,
      unit: "bpm",
    });
    expect(result).toMatchObject({ saved: false });
    expect(JSON.stringify(result)).toContain("Encounter");
    expect(decide).not.toHaveBeenCalled();
    expect(createResource).not.toHaveBeenCalled();
  });
});
