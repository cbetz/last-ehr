import { describe, expect, it } from "vitest";

import { McpConfigurationError, loadMcpConfig } from "./config.js";

describe("MCP runtime configuration", () => {
  it("accepts a single Medplum access token", () => {
    expect(
      loadMcpConfig({ MEDPLUM_ACCESS_TOKEN: "token-value" }),
    ).toMatchObject({ accessToken: "token-value", writePolicy: "read-only" });
  });

  it("accepts complete Medplum client credentials", () => {
    expect(
      loadMcpConfig({
        MEDPLUM_CLIENT_ID: "client-id",
        MEDPLUM_CLIENT_SECRET: "client-secret",
        MEDPLUM_BASE_URL: "https://medplum.example/",
      }),
    ).toMatchObject({
      clientId: "client-id",
      clientSecret: "client-secret",
      baseUrl: "https://medplum.example/",
    });
  });

  it("rejects incomplete, mixed, and write-enabled configurations", () => {
    expect(() => loadMcpConfig({})).toThrow(McpConfigurationError);
    expect(() => loadMcpConfig({ MEDPLUM_CLIENT_ID: "client-id" })).toThrow(
      "must be set together",
    );
    expect(() =>
      loadMcpConfig({
        MEDPLUM_ACCESS_TOKEN: "token-value",
        MEDPLUM_CLIENT_ID: "client-id",
        MEDPLUM_CLIENT_SECRET: "client-secret",
      }),
    ).toThrow("not both");
    expect(() =>
      loadMcpConfig({
        MEDPLUM_ACCESS_TOKEN: "token-value",
        LASTEHR_MCP_WRITES: "true",
      }),
    ).toThrow("read-only by default");
  });
});

describe("MCP FHIR_BACKEND selection", () => {
  it("defaults to medplum", () => {
    expect(
      loadMcpConfig({ MEDPLUM_ACCESS_TOKEN: "token-value" }),
    ).toMatchObject({ backend: "medplum" });
  });

  it("selects hapi from the same env pair the web app honors", () => {
    expect(
      loadMcpConfig({
        FHIR_BACKEND: "hapi",
        FHIR_BASE_URL: "http://localhost:8080/fhir",
      }),
    ).toMatchObject({
      backend: "hapi",
      baseUrl: "http://localhost:8080/fhir",
      writePolicy: "read-only",
    });
  });

  it("prefers the per-backend HAPI_BASE_URL over the shared FHIR_BASE_URL", () => {
    expect(
      loadMcpConfig({
        FHIR_BACKEND: "hapi",
        HAPI_BASE_URL: "http://hapi:8080/fhir",
        FHIR_BASE_URL: "http://other:8080/fhir",
      }),
    ).toMatchObject({ baseUrl: "http://hapi:8080/fhir" });
  });

  it("ignores unused Medplum credentials in hapi mode (a checkout's .env carries both)", () => {
    expect(
      loadMcpConfig({
        FHIR_BACKEND: "hapi",
        FHIR_BASE_URL: "http://localhost:8080/fhir",
        MEDPLUM_ACCESS_TOKEN: "token-value",
        MEDPLUM_CLIENT_ID: "client-id",
        MEDPLUM_CLIENT_SECRET: "client-secret",
      }),
    ).toMatchObject({ backend: "hapi" });
  });

  it("requires a base URL and a valid URL in hapi mode", () => {
    expect(() => loadMcpConfig({ FHIR_BACKEND: "hapi" })).toThrow(
      "HAPI_BASE_URL or FHIR_BASE_URL",
    );
    expect(() =>
      loadMcpConfig({ FHIR_BACKEND: "hapi", FHIR_BASE_URL: "not a url" }),
    ).toThrow("complete URL");
  });

  it("rejects unknown backends and write flags in every mode", () => {
    expect(() =>
      loadMcpConfig({ FHIR_BACKEND: "firely", FHIR_BASE_URL: "http://x/" }),
    ).toThrow("Supported values: medplum (default), hapi");
    expect(() =>
      loadMcpConfig({
        FHIR_BACKEND: "hapi",
        FHIR_BASE_URL: "http://localhost:8080/fhir",
        LASTEHR_MCP_WRITES: "true",
      }),
    ).toThrow("read-only by default");
  });
});

describe("MCP write policy", () => {
  it("defaults to read-only", () => {
    expect(
      loadMcpConfig({ MEDPLUM_ACCESS_TOKEN: "token-value" }),
    ).toMatchObject({ writePolicy: "read-only" });
  });

  it('accepts exactly "proposal" as the opt-in, in both backend modes', () => {
    expect(
      loadMcpConfig({
        MEDPLUM_ACCESS_TOKEN: "token-value",
        LASTEHR_MCP_WRITES: "proposal",
      }),
    ).toMatchObject({ writePolicy: "proposal" });
    expect(
      loadMcpConfig({
        FHIR_BACKEND: "hapi",
        FHIR_BASE_URL: "http://localhost:8080/fhir",
        LASTEHR_MCP_WRITES: "proposal",
      }),
    ).toMatchObject({ writePolicy: "proposal" });
  });

  it("keeps rejecting every other write flag value loudly", () => {
    for (const bad of ["true", "1", "yes", "unsafe", "PROPOSAL "]) {
      expect(() =>
        loadMcpConfig({
          MEDPLUM_ACCESS_TOKEN: "token-value",
          LASTEHR_MCP_WRITES: bad,
        }),
      ).toThrow("read-only by default");
    }
  });
});
