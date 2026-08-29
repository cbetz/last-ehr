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

  it("parses LASTEHR_WRITE_PROVENANCE strictly: only the string 'true' enables it", () => {
    const base = { MEDPLUM_ACCESS_TOKEN: "token-value" };
    expect(loadMcpConfig(base).writeProvenance).toBe(false);
    expect(
      loadMcpConfig({ ...base, LASTEHR_WRITE_PROVENANCE: "true" })
        .writeProvenance,
    ).toBe(true);
    for (const value of ["TRUE", "1", "yes", ""]) {
      expect(
        loadMcpConfig({ ...base, LASTEHR_WRITE_PROVENANCE: value })
          .writeProvenance,
      ).toBe(false);
    }
  });

  it("parses LASTEHR_WRITE_TOOLS_DISABLED and rejects unknown names loudly", () => {
    const base = { MEDPLUM_ACCESS_TOKEN: "token-value" };
    expect(loadMcpConfig(base).disabledWriteTools).toEqual([]);
    expect(
      loadMcpConfig({ ...base, LASTEHR_WRITE_TOOLS_DISABLED: "add_note" })
        .disabledWriteTools,
    ).toEqual(["add_note"]);
    expect(
      loadMcpConfig({
        ...base,
        LASTEHR_WRITE_TOOLS_DISABLED: " add_note , record_observation ,create_task",
      }).disabledWriteTools,
    ).toEqual(["add_note", "record_observation", "create_task"]);
    // A typo'd tightening control must not silently disable nothing.
    expect(() =>
      loadMcpConfig({ ...base, LASTEHR_WRITE_TOOLS_DISABLED: "add-note" }),
    ).toThrow(McpConfigurationError);
  });
});

describe("MCP transport selection", () => {
  // Every field the remote transport needs, so individual tests can remove one
  // and assert that startup stops.
  const HTTP_ENV = {
    LASTEHR_MCP_TRANSPORT: "http",
    LASTEHR_MCP_RESOURCE: "https://mcp.example.test/mcp",
    LASTEHR_MCP_OAUTH_ISSUER: "https://auth.example.test/",
    LASTEHR_MCP_OAUTH_JWKS_URI: "https://auth.example.test/.well-known/jwks.json",
    LASTEHR_MCP_EXCHANGE_CLIENT_ID: "client-with-idp",
    LASTEHR_MCP_TOKEN_ENDPOINT: "https://fhir.example.test/oauth2/token",
  };

  it("defaults to stdio", () => {
    expect(loadMcpConfig({ MEDPLUM_ACCESS_TOKEN: "t" })).toMatchObject({
      transport: "stdio",
      http: undefined,
    });
  });

  it("rejects an unknown transport rather than falling back", () => {
    expect(() =>
      loadMcpConfig({ MEDPLUM_ACCESS_TOKEN: "t", LASTEHR_MCP_TRANSPORT: "sse" }),
    ).toThrow(McpConfigurationError);
  });

  it("reads a complete http configuration", () => {
    expect(loadMcpConfig(HTTP_ENV)).toMatchObject({
      transport: "http",
      http: {
        port: 3400,
        host: "127.0.0.1",
        resource: "https://mcp.example.test/mcp",
        issuer: "https://auth.example.test/",
        exchangeClientId: "client-with-idp",
        requiredScopes: [],
      },
    });
  });

  // A remote server that starts without an audience to require, or without a
  // JWKS to verify against, would accept tokens it should refuse. The probe in
  // docs/remote-mcp.md shows a FHIR token looks valid while addressed
  // elsewhere, so there is no partial HTTP mode.
  it.each([
    "LASTEHR_MCP_RESOURCE",
    "LASTEHR_MCP_OAUTH_ISSUER",
    "LASTEHR_MCP_OAUTH_JWKS_URI",
    "LASTEHR_MCP_EXCHANGE_CLIENT_ID",
    "LASTEHR_MCP_TOKEN_ENDPOINT",
  ])("refuses to start when %s is missing", (key) => {
    const env: Record<string, string | undefined> = { ...HTTP_ENV };
    delete env[key];
    expect(() => loadMcpConfig(env)).toThrow(new RegExp(key));
  });

  it.each([
    "LASTEHR_MCP_RESOURCE",
    "LASTEHR_MCP_OAUTH_ISSUER",
    "LASTEHR_MCP_OAUTH_JWKS_URI",
    "LASTEHR_MCP_TOKEN_ENDPOINT",
  ])("refuses a %s that is not a complete URL", (key) => {
    expect(() => loadMcpConfig({ ...HTTP_ENV, [key]: "not-a-url" })).toThrow(
      /complete URL/,
    );
  });

  // The local HAPI stack has no auth and no per-user identity, so there is no
  // caller token to verify and nothing for the exchange to return.
  it("refuses http combined with the no-auth HAPI backend", () => {
    expect(() =>
      loadMcpConfig({
        ...HTTP_ENV,
        FHIR_BACKEND: "hapi",
        HAPI_BASE_URL: "http://localhost:8080/fhir",
      }),
    ).toThrow(/unauthenticated chart API/);
  });

  // The point of the remote transport: the credential is per caller, so the
  // process holds none. Requiring one here would have forced operators to
  // configure exactly the shared credential the design rejects.
  it("does not require a server-side Medplum credential", () => {
    const config = loadMcpConfig(HTTP_ENV);
    expect(config.accessToken).toBeUndefined();
    expect(config.clientId).toBeUndefined();
  });

  it("still requires a credential for stdio", () => {
    expect(() => loadMcpConfig({})).toThrow(/MEDPLUM_ACCESS_TOKEN/);
  });

  it("binds loopback unless an operator names another host", () => {
    expect(loadMcpConfig(HTTP_ENV).http?.host).toBe("127.0.0.1");
    expect(
      loadMcpConfig({ ...HTTP_ENV, LASTEHR_MCP_HTTP_HOST: "0.0.0.0" }).http?.host,
    ).toBe("0.0.0.0");
  });

  it.each(["0", "65536", "abc", "8080.5"])("rejects the invalid port %s", (port) => {
    expect(() =>
      loadMcpConfig({ ...HTTP_ENV, LASTEHR_MCP_HTTP_PORT: port }),
    ).toThrow(/between 1 and 65535/);
  });

  it("parses required scopes as a trimmed, non-empty list", () => {
    expect(
      loadMcpConfig({
        ...HTTP_ENV,
        LASTEHR_MCP_REQUIRED_SCOPES: " chart.read , , chart.write ",
      }).http?.requiredScopes,
    ).toEqual(["chart.read", "chart.write"]);
  });

  it("passes an optional membership pin through", () => {
    expect(loadMcpConfig(HTTP_ENV).http?.membershipId).toBeUndefined();
    expect(
      loadMcpConfig({ ...HTTP_ENV, LASTEHR_MCP_MEMBERSHIP_ID: "m-1" }).http
        ?.membershipId,
    ).toBe("m-1");
  });

  it("keeps the write default read-only under http, like stdio", () => {
    expect(loadMcpConfig(HTTP_ENV).writePolicy).toBe("read-only");
    expect(
      loadMcpConfig({ ...HTTP_ENV, LASTEHR_MCP_WRITES: "proposal" }).writePolicy,
    ).toBe("proposal");
  });
});
