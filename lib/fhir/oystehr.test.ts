import { describe, it, expect, vi, afterEach } from "vitest";
import type { Bundle } from "@medplum/fhirtypes";

import {
  OystehrBackend,
  OYSTEHR_TOKEN_URL,
} from "@/lib/fhir/oystehr";
import { defineFhirRestAdapterContract } from "@/test/fhir-rest-adapter-contract";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Wire-level transport behavior, shared with every REST adapter. Static-token
// mode so the harness's fetch stub sees only FHIR traffic; the token flow has
// its own suite below.
defineFhirRestAdapterContract({
  name: "OystehrBackend",
  createBackend: (baseUrl) =>
    new OystehrBackend({
      baseUrl,
      accessToken: "test-token",
      projectId: "proj-1",
    }),
  expectedHeaders: {
    authorization: "Bearer test-token",
    "x-oystehr-project-id": "proj-1",
  },
});

// A syntactically valid JWT whose exp claim is now + ttlSeconds.
function jwtWithTtl(ttlSeconds: number): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString("base64");
  return `header.${payload}.signature`;
}

const EMPTY_BUNDLE: Bundle = { resourceType: "Bundle", type: "searchset" };

// Routes token mints and FHIR calls separately so tests can count each.
function fakeOystehr({ token = jwtWithTtl(24 * 60 * 60), tokenStatus = 200 } = {}) {
  const tokenCalls: RequestInit[] = [];
  const fhirCalls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === OYSTEHR_TOKEN_URL) {
      tokenCalls.push(init ?? {});
      return new Response(
        tokenStatus === 200 ? JSON.stringify({ access_token: token }) : "{}",
        { status: tokenStatus },
      );
    }
    fhirCalls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(EMPTY_BUNDLE), { status: 200 });
  });
  const backend = new OystehrBackend({
    clientId: "m2m-client",
    clientSecret: "m2m-secret",
    baseUrl: "https://fhir.example.test/r4",
    fetch: fetchFn as typeof globalThis.fetch,
  });
  return { backend, tokenCalls, fhirCalls };
}

describe("OystehrBackend client-credentials flow", () => {
  it("mints with the documented JSON body and sends the bearer on FHIR calls", async () => {
    const { backend, tokenCalls, fhirCalls } = fakeOystehr();
    await backend.search("Patient", { name: "smith" });

    expect(tokenCalls).toHaveLength(1);
    expect(new Headers(tokenCalls[0].headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(tokenCalls[0].body))).toEqual({
      grant_type: "client_credentials",
      client_id: "m2m-client",
      client_secret: "m2m-secret",
      audience: "https://api.zapehr.com",
    });
    expect(fhirCalls).toHaveLength(1);
    expect(new Headers(fhirCalls[0].init.headers).get("authorization")).toMatch(
      /^Bearer header\./,
    );
  });

  it("caches the token across sequential requests", async () => {
    const { backend, tokenCalls } = fakeOystehr();
    await backend.search("Patient");
    await backend.search("Observation");
    expect(tokenCalls).toHaveLength(1);
  });

  it("single-flights parallel cold-start requests through one mint", async () => {
    const { backend, tokenCalls, fhirCalls } = fakeOystehr();
    // A chart view fires several searches at once.
    await Promise.all([
      backend.search("Patient"),
      backend.search("Observation"),
      backend.search("Communication"),
    ]);
    expect(tokenCalls).toHaveLength(1);
    expect(fhirCalls).toHaveLength(3);
  });

  it("re-mints when the token's exp claim is within the refresh margin", async () => {
    // ttl 0: immediately stale, so every request needs a fresh mint.
    const { backend, tokenCalls } = fakeOystehr({ token: jwtWithTtl(0) });
    await backend.search("Patient");
    await backend.search("Patient");
    expect(tokenCalls).toHaveLength(2);
  });

  it("fails with status only on a rejected mint — never the secret or body", async () => {
    const { backend } = fakeOystehr({ tokenStatus: 401 });
    const failure = await backend.search("Patient").then(
      () => {
        throw new Error("expected the search to fail");
      },
      (error: unknown) => error as Error & { statusCode?: number },
    );
    expect(failure.message).toBe("Oystehr token request failed: HTTP 401");
    expect(failure.statusCode).toBe(401);
    expect(failure.message).not.toContain("m2m-secret");
  });

  it("rejects a token response without access_token", async () => {
    const fetchFn = vi.fn(
      async () => new Response(JSON.stringify({}), { status: 200 }),
    );
    const backend = new OystehrBackend({
      clientId: "id",
      clientSecret: "secret",
      baseUrl: "https://fhir.example.test/r4",
      fetch: fetchFn as typeof globalThis.fetch,
    });
    await expect(backend.search("Patient")).rejects.toThrow(
      "did not include access_token",
    );
  });

  it("requires credentials or a pre-minted token", () => {
    expect(() => new OystehrBackend({})).toThrow(
      "clientId + clientSecret",
    );
    expect(
      () => new OystehrBackend({ accessToken: "tok" }),
    ).not.toThrow();
  });

  it("omits the project header unless a projectId is configured", async () => {
    const { backend, fhirCalls } = fakeOystehr();
    await backend.search("Patient");
    expect(
      new Headers(fhirCalls[0].init.headers).get("x-oystehr-project-id"),
    ).toBeNull();
  });
});
