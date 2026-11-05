import { exportPKCS8, generateKeyPair } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { listStagedWrites } from "./dry-run-write";
import {
  adjustOracleHealthSearchParams,
  OracleHealthBackend,
  ORACLE_HEALTH_OPEN_SANDBOX_BASE_URL,
} from "./oracle-health";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Oracle Health open-sandbox adapter", () => {
  it("drops _count when _id is present and leaves every other search alone", () => {
    expect(
      adjustOracleHealthSearchParams({ _id: "12742400", _count: "1" }),
    ).toEqual({ _id: "12742400" });
    expect(
      adjustOracleHealthSearchParams({
        patient: "12742400",
        _count: "1",
        category: "vital-signs",
      }),
    ).toEqual({
      patient: "12742400",
      _count: "1",
      category: "vital-signs",
    });
  });

  it("searches the open sandbox with structured params and no auth header", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({ resourceType: "Bundle", type: "searchset", entry: [] }),
        ),
    });
    const backend = new OracleHealthBackend({ fetch });

    await backend.search("Patient", { _id: "12742400", _count: "1" });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${ORACLE_HEALTH_OPEN_SANDBOX_BASE_URL}/Patient?_id=12742400`,
    );
    const headers = new Headers(init.headers);
    expect(headers.get("accept")).toBe("application/fhir+json");
    expect(headers.get("authorization")).toBeNull();
  });

  it("stages a proposed create and does not POST", async () => {
    const fetch = vi.fn();
    const backend = new OracleHealthBackend({ fetch });
    const resource = {
      resourceType: "Observation" as const,
      status: "final" as const,
      code: { text: "Adapter probe" },
    };

    await expect(backend.createResource(resource)).rejects.toMatchObject({
      code: "FHIR_DRY_RUN",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(listStagedWrites(backend)[0]?.resource).toEqual(resource);
    expect(backend.writeDisposition).toBe("dry-run");
  });

  it("refuses delete without sending it", async () => {
    const fetch = vi.fn();
    const backend = new OracleHealthBackend({ fetch });

    await expect(
      backend.deleteResource("Observation", "obs-1"),
    ).rejects.toMatchObject({ code: "FHIR_READ_ONLY" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts application/fhir+json with a bearer when SMART auth is configured", async () => {
    const { privateKey } = await generateKeyPair("RS384", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const { createSmartBackendServicesTokenSource } = await import("./smart-backend");
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/token")) {
        return new Response(
          JSON.stringify({ access_token: "oracle-token", expires_in: 3600 }),
          { status: 200 },
        );
      }
      return new Response(null, {
        status: 201,
        headers: { location: "https://fhir.example.test/r4/tenant/Observation/VS-209196396" },
      });
    });
    const fetchFn = fetch as typeof globalThis.fetch;
    const backend = new OracleHealthBackend({
      baseUrl: "https://fhir.example.test/r4/tenant",
      fetch: fetchFn,
      getAccessToken: createSmartBackendServicesTokenSource({
        clientId: "oracle-client",
        privateKeyPem: pem,
        keyId: "lastehr-oracle-1",
        scopes: "system/Observation.read system/Observation.write",
        tokenUrl: "https://auth.example.test/token",
        fetch: fetchFn,
      }),
    });
    const created = await backend.createResource({
      resourceType: "Observation",
      status: "final",
      code: { text: "Temperature Oral" },
    });
    expect(created.id).toBe("VS-209196396");
    expect(backend.writeDisposition).toBe("persist");
    expect(backend.vendorProfile?.id).toBe("oracle");
    const post = calls.find(
      (call) => call.init?.method === "POST" && call.url.endsWith("/Observation"),
    );
    const headers = new Headers(post?.init?.headers);
    expect(headers.get("content-type")).toBe("application/fhir+json");
    expect(headers.get("accept")).toBe("application/fhir+json");
    expect(headers.get("authorization")).toBe("Bearer oracle-token");
    const tokenCall = calls.find((call) => call.url.endsWith("/token"));
    const body = new URLSearchParams(String(tokenCall?.init?.body));
    expect(body.get("scope")).toBe(
      "system/Observation.read system/Observation.write",
    );
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(String(tokenCall?.init?.body)).not.toContain("BEGIN PRIVATE KEY");
  });
});
