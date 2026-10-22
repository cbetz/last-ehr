import { afterEach, describe, expect, it, vi } from "vitest";

import { loadMcpConfig, type McpRuntimeConfig } from "./config.js";
import { runDoctor } from "./doctor.js";

const metadata = { resourceType: "CapabilityStatement", fhirVersion: "4.0.1" };
const countBundle = { resourceType: "Bundle", type: "searchset", total: 123456, entry: [] };
const hapi = loadMcpConfig({ FHIR_BACKEND: "hapi", HAPI_BASE_URL: "http://localhost:8080/fhir/" });
const medplum = loadMcpConfig({
  MEDPLUM_BASE_URL: "https://fhir.example.test/",
  MEDPLUM_ACCESS_TOKEN: "private-access-token",
});
const http = loadMcpConfig({
  LASTEHR_MCP_TRANSPORT: "http",
  LASTEHR_MCP_RESOURCE: "https://mcp.example.test/mcp?secret=resource-secret",
  LASTEHR_MCP_OAUTH_ISSUER: "https://auth.example.test/",
  LASTEHR_MCP_OAUTH_JWKS_URI: "https://auth.example.test/jwks?secret=jwks-secret",
  LASTEHR_MCP_EXCHANGE_CLIENT_ID: "private-client-id",
  LASTEHR_MCP_TOKEN_ENDPOINT: "https://fhir.example.test/oauth2/token",
});

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/fhir+json" },
});
const fetchUrl = (input: Parameters<typeof fetch>[0]) =>
  input instanceof Request ? input.url : String(input);

function successfulFetch() {
  return vi.fn<typeof fetch>(async (input) =>
    json(fetchUrl(input).includes("/metadata") ? metadata : countBundle),
  );
}

describe("MCP doctor", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the default check local and names the unverified boundaries", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const report = await runDoctor(medplum, { fetchFn });
    expect(report.ok).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(report.lines.join("\n")).toContain("No connection attempted");
    expect(report.lines.join("\n")).toContain("host approval/elicitation support");
    expect(report.lines.join("\n")).not.toContain(medplum.accessToken);
  });

  it.each([false, true])("does not imply HTTP caller or client checks ran (connect=%s)", async (connect) => {
    const fetchFn = vi.fn<typeof fetch>();
    const report = await runDoctor(http, { connect, fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(report.ok).toBe(!connect);
    expect(report.lines.join("\n")).toContain("per-caller token exchange");
    expect(report.lines.join("\n")).toContain("remain unverified");
    expect(report.lines.join("\n")).not.toMatch(/example\.test|resource-secret|jwks-secret|private-client-id/);
  });

  it("probes HAPI metadata and a count-only Patient search without a chart write", async () => {
    const fetchFn = successfulFetch();
    const report = await runDoctor(hapi, { connect: true, fetchFn });
    expect(report.ok).toBe(true);
    expect(fetchFn.mock.calls.map(([input]) => fetchUrl(input))).toEqual([
      "http://localhost:8080/fhir/metadata",
      "http://localhost:8080/fhir/Patient?_summary=count&_count=0",
    ]);
    for (const [, init] of fetchFn.mock.calls) {
      expect(init?.method ?? "GET").toBe("GET");
      expect(init?.redirect).toBe("manual");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.body).toBeUndefined();
      expect(new Headers(init?.headers).get("authorization")).toBeNull();
    }
    expect(report.lines.join("\n")).toContain("not access to individual charts");
    expect(report.lines.join("\n")).not.toMatch(/123456|localhost/);
  });

  it("uses the existing Medplum access-token client for both probes", async () => {
    const fetchFn = successfulFetch();
    const report = await runDoctor(medplum, { connect: true, fetchFn });
    expect(report.ok).toBe(true);
    expect(fetchFn.mock.calls.map(([input]) => fetchUrl(input))).toEqual([
      "https://fhir.example.test/fhir/R4/metadata",
      "https://fhir.example.test/fhir/R4/Patient?_summary=count&_count=0",
    ]);
    for (const [, init] of fetchFn.mock.calls) {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer private-access-token");
      expect(init?.method ?? "GET").toBe("GET");
      expect(init?.redirect).toBe("manual");
    }
    expect(report.lines.join("\n")).not.toMatch(/private-access-token|example\.test|123456/);
  });

  it("allows the existing client-credentials login but no FHIR POST", async () => {
    const config = loadMcpConfig({
      MEDPLUM_BASE_URL: "https://fhir.example.test/",
      MEDPLUM_CLIENT_ID: "configured-client",
      MEDPLUM_CLIENT_SECRET: "configured-secret",
    });
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      const url = fetchUrl(input);
      if (url.endsWith("/oauth2/token")) return json({ access_token: "fresh-access-token" });
      return json(url.endsWith("/metadata") ? metadata : countBundle);
    });
    const report = await runDoctor(config, { connect: true, fetchFn });
    expect(report.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const [, tokenInit] = fetchFn.mock.calls[0];
    expect(tokenInit?.method).toBe("POST");
    expect(new URLSearchParams(String(tokenInit?.body)).get("grant_type")).toBe("client_credentials");
    expect(fetchFn.mock.calls.slice(1).every(([, init]) => init?.method === "GET")).toBe(true);
    expect(report.lines.join("\n")).not.toMatch(/configured-client|configured-secret|fresh-access-token|example\.test/);
  });

  it.each([401, 403, 500])("reports HTTP %s without exposing backend diagnostics", async (status) => {
    const fetchFn = vi.fn<typeof fetch>(async (input) =>
      fetchUrl(input).endsWith("/metadata")
        ? json(metadata)
        : json({ diagnostics: "Patient/private-id private-access-token" }, status),
    );
    const report = await runDoctor(medplum, { connect: true, fetchFn });
    expect(report.ok).toBe(false);
    expect(report.lines.join("\n")).toContain(`HTTP ${status}`);
    expect(report.lines.join("\n")).not.toMatch(/private-id|private-access-token|example\.test|diagnostics/);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("scrubs a client-credentials login denial before any FHIR probe", async () => {
    const config = loadMcpConfig({
      MEDPLUM_CLIENT_ID: "private-client",
      MEDPLUM_CLIENT_SECRET: "private-secret",
    });
    const fetchFn = vi.fn<typeof fetch>(async () => json({
      error_description: "private-secret private-patient",
    }, 401));
    const report = await runDoctor(config, { connect: true, fetchFn });
    expect(report.ok).toBe(false);
    expect(fetchFn.mock.calls.every(([input, init]) =>
      fetchUrl(input).endsWith("/oauth2/token") && init?.method === "POST",
    )).toBe(true);
    expect(report.lines.join("\n")).not.toMatch(/private-client|private-secret|private-patient|api\.medplum\.com/);
  });

  it("refuses a redirect without visiting the server-selected location", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, {
      status: 302,
      headers: { location: "https://other.example/private-token" },
    }));
    const report = await runDoctor(hapi, { connect: true, fetchFn });
    expect(report.ok).toBe(false);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(report.lines.join("\n")).toContain("refused a redirect");
    expect(report.lines.join("\n")).not.toMatch(/other\.example|private-token/);
  });

  it.each([
    { resourceType: "Patient", id: "private-id" },
    { resourceType: "CapabilityStatement", fhirVersion: "5.0.0" },
    { resourceType: "CapabilityStatement" },
  ])("requires R4 capability metadata before attempting a Patient search", async (value) => {
    const fetchFn = vi.fn<typeof fetch>(async () => json(value));
    const report = await runDoctor(hapi, { connect: true, fetchFn });
    expect(report.ok).toBe(false);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(report.lines.join("\n")).toContain("not a FHIR R4 CapabilityStatement");
    expect(report.lines.join("\n")).not.toContain("private-id");
  });

  it("fails when a backend ignores count-only search and returns chart content", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) => json(
      fetchUrl(input).endsWith("/metadata") ? metadata : {
        ...countBundle,
        entry: [{ resource: { resourceType: "Patient", id: "private-patient", name: [{ text: "Private Name" }] } }],
      },
    ));
    const report = await runDoctor(hapi, { connect: true, fetchFn });
    expect(report.ok).toBe(false);
    expect(report.lines.join("\n")).toContain("did not return a count-only search bundle");
    expect(report.lines.join("\n")).not.toMatch(/private-patient|Private Name|123456/);
  });

  it("scrubs malformed JSON and network errors", async () => {
    for (const fetchFn of [
      vi.fn<typeof fetch>(async () => new Response("private-patient invalid JSON")),
      vi.fn<typeof fetch>(async () => { throw new Error("secret URL https://private.example/?token=secret"); }),
    ]) {
      const report = await runDoctor(hapi, { connect: true, fetchFn });
      expect(report.ok).toBe(false);
      expect(report.lines.join("\n")).not.toMatch(/private-patient|private\.example|token=secret/);
      expect(report.lines.join("\n")).toContain("diagnostics were withheld");
    }
  });

  it.each(["metadata", "count", "token", "profile"])("blocks malformed %s JSON before SDK parsing can log its contents", async (stage) => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    const accessToken = `e30.${Buffer.from(JSON.stringify({
      login_id: "synthetic-login",
      client_id: "synthetic-client",
      exp: 4_070_908_800,
    })).toString("base64url")}.signature`;
    const config = stage === "token" || stage === "profile"
      ? loadMcpConfig({
        MEDPLUM_BASE_URL: "https://fhir.example.test/",
        MEDPLUM_CLIENT_ID: "synthetic-client",
        MEDPLUM_CLIENT_SECRET: "synthetic-secret",
      })
      : medplum;
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(fetchUrl(input)).pathname;
      const current = path.endsWith("/token") ? "token"
        : path.endsWith("/me") ? "profile"
          : path.endsWith("/metadata") ? "metadata" : "count";
      if (current === stage) {
        return new Response("private-patient SECRET_RESPONSE_TOKEN is not JSON", {
          headers: { "content-type": "application/fhir+json" },
        });
      }
      return json(current === "token" ? { access_token: accessToken }
        : current === "metadata" ? metadata : countBundle);
    });
    const report = await runDoctor(config, { connect: true, fetchFn });
    expect(report.ok).toBe(false);
    expect(fetchFn.mock.calls.some(([input]) => {
      const path = new URL(fetchUrl(input)).pathname;
      return stage === "token" ? path.endsWith("/token")
        : stage === "profile" ? path.endsWith("/me")
          : stage === "metadata" ? path.endsWith("/metadata") : path.endsWith("/Patient");
    })).toBe(true);
    expect(stderr).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(report.lines.join("\n")).not.toMatch(/private-patient|SECRET_RESPONSE_TOKEN|SyntaxError/);
  });

  it.each(["metadata", "count", "token", "profile"])("withholds an HTTP 200 OperationOutcome from the %s SDK path", async (stage) => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    const accessToken = `e30.${Buffer.from(JSON.stringify({
      login_id: "synthetic-login",
      client_id: "synthetic-client",
      exp: 4_070_908_800,
    })).toString("base64url")}.signature`;
    const config = stage === "token" || stage === "profile"
      ? loadMcpConfig({
        MEDPLUM_BASE_URL: "https://fhir.example.test/",
        MEDPLUM_CLIENT_ID: "synthetic-client",
        MEDPLUM_CLIENT_SECRET: "synthetic-secret",
      })
      : medplum;
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(fetchUrl(input)).pathname;
      const current = path.endsWith("/token") ? "token"
        : path.endsWith("/me") ? "profile"
          : path.endsWith("/metadata") ? "metadata" : "count";
      if (current === stage) {
        return json({
          resourceType: "OperationOutcome",
          issue: [{ diagnostics: "private-patient SECRET_RESPONSE_TOKEN" }],
        });
      }
      return json(current === "token" ? { access_token: accessToken }
        : current === "metadata" ? metadata : countBundle);
    });
    const report = await runDoctor(config, { connect: true, fetchFn });
    expect(report.ok).toBe(false);
    expect(stderr).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(report.lines.join("\n")).not.toMatch(/private-patient|SECRET_RESPONSE_TOKEN|OperationOutcome/);
  });

  it("cancels an oversized response rather than parsing unbounded data", async () => {
    const cancel = vi.fn();
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
      cancel,
    })));
    const report = await runDoctor(hapi, { connect: true, fetchFn });
    expect(report.ok).toBe(false);
    expect(cancel).toHaveBeenCalledOnce();
    expect(report.lines.join("\n")).toContain("size limit");
  });

  it.each(["fetch", "body"])("bounds a stalled %s and aborts outstanding work", async (stage) => {
    vi.useFakeTimers();
    const fetchFn = vi.fn<typeof fetch>(async () => stage === "fetch"
      ? new Promise<Response>(() => {})
      : new Response(new ReadableStream({ start() {} })),
    );
    const pending = runDoctor(hapi, { connect: true, fetchFn, timeoutMs: 20 });
    await vi.advanceTimersByTimeAsync(20);
    const report = await pending;
    expect(report.ok).toBe(false);
    expect(report.lines.join("\n")).toContain("timed out");
    expect(fetchFn.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("also bounds Medplum authentication, not only the later FHIR reads", async () => {
    vi.useFakeTimers();
    const config = loadMcpConfig({ MEDPLUM_CLIENT_ID: "client", MEDPLUM_CLIENT_SECRET: "secret" });
    const fetchFn = vi.fn<typeof fetch>(async () => new Promise<Response>(() => {}));
    const pending = runDoctor(config, { connect: true, fetchFn, timeoutMs: 20 });
    await vi.advanceTimersByTimeAsync(20);
    const report = await pending;
    expect(report.ok).toBe(false);
    expect(report.lines.join("\n")).toContain("timed out");
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it.each([
    "https://user:private-secret@fhir.example.test/",
    "https://fhir.example.test/?secret=private-secret",
    "https://fhir.example.test/#private-secret",
    "file:///private-secret",
  ])("refuses credentialed or ambiguous probe bases without printing them", async (baseUrl) => {
    const fetchFn = vi.fn<typeof fetch>();
    const config: McpRuntimeConfig = { ...medplum, baseUrl };
    const report = await runDoctor(config, { connect: true, fetchFn });
    expect(report.ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(report.lines.join("\n")).not.toMatch(/private-secret|fhir\.example/);
  });
});
