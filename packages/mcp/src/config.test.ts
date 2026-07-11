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
    ).toThrow("intentionally read-only");
  });
});
