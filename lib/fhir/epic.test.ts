import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defineFhirRestAdapterContract } from "@/test/fhir-rest-adapter-contract";

import { EpicBackend, EPIC_SANDBOX_TOKEN_URL, EPIC_SEARCH_SCOPE_MESSAGE } from "./epic";

afterEach(() => {
  vi.unstubAllGlobals();
});

defineFhirRestAdapterContract({
  name: "EpicBackend (static token)",
  createBackend: (baseUrl) =>
    new EpicBackend({ baseUrl, accessToken: "epic-test-token" }),
  expectedHeaders: { authorization: "Bearer epic-test-token" },
});

describe("EpicBackend SMART Backend Services scaffold", () => {
  it("refuses to construct without a token or a key", () => {
    expect(() => new EpicBackend({})).toThrow(/privateKeyPem/);
  });

  it("posts a short-lived RS384 client assertion and caches the bearer", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS384", {
      extractable: true,
    });
    const pem = await exportPKCS8(privateKey);
    const tokenCalls: RequestInit[] = [];
    const fhirCalls: string[] = [];
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === EPIC_SANDBOX_TOKEN_URL) {
        tokenCalls.push(init ?? {});
        return new Response(
          JSON.stringify({ access_token: "minted-token", expires_in: 3600 }),
          { status: 200 },
        );
      }
      fhirCalls.push(String(url));
      return new Response(
        JSON.stringify({ resourceType: "Bundle", type: "searchset", entry: [] }),
        { status: 200 },
      );
    });
    const backend = new EpicBackend({
      clientId: "non-prod-client",
      privateKeyPem: pem,
      privateKeyId: "key-1",
      baseUrl: "https://fhir.example.test/R4",
      fetch: fetchFn as typeof globalThis.fetch,
    });

    await Promise.all([
      backend.search("Patient", { _id: "p1" }),
      backend.search("Patient", { _id: "p1" }),
    ]);

    expect(tokenCalls).toHaveLength(1);
    expect(fhirCalls).toHaveLength(2);
    const headers = new Headers(tokenCalls[0]?.headers);
    expect(headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    const body = new URLSearchParams(String(tokenCalls[0]?.body));
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_assertion_type")).toBe(
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    );
    const assertion = body.get("client_assertion");
    expect(assertion).toBeTruthy();
    const verified = await jwtVerify(assertion as string, publicKey, {
      issuer: "non-prod-client",
      audience: EPIC_SANDBOX_TOKEN_URL,
    });
    expect(verified.payload.sub).toBe("non-prod-client");
    expect(verified.protectedHeader.alg).toBe("RS384");
    expect(verified.protectedHeader.kid).toBe("key-1");
    const exp = verified.payload.exp ?? 0;
    const iat = verified.payload.iat ?? 0;
    expect(exp - iat).toBeLessThanOrEqual(5 * 60);
    expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const fhirHeaders = new Headers(
      (fetchFn.mock.calls[1]?.[1] as RequestInit | undefined)?.headers,
    );
    expect(fhirHeaders.get("authorization")).toBe("Bearer minted-token");
  });

  it("reports the HTTP status and not the token body when minting fails", async () => {
    const { privateKey } = await generateKeyPair("RS384", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const fetchFn = vi.fn(async () => new Response("nope", { status: 401 }));
    const backend = new EpicBackend({
      clientId: "non-prod-client",
      privateKeyPem: pem,
      fetch: fetchFn as typeof globalThis.fetch,
    });

    await expect(backend.search("Patient")).rejects.toThrow(
      "SMART token request failed: HTTP 401",
    );
    await expect(backend.search("Patient")).rejects.not.toThrow(/nope|BEGIN PRIVATE KEY/);
  });

  it("does not describe a token HTTP 403 as a missing search scope", async () => {
    const { privateKey } = await generateKeyPair("RS384", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const fetchFn = vi.fn(async () => new Response("nope", { status: 403 }));
    const backend = new EpicBackend({
      clientId: "non-prod-client",
      privateKeyPem: pem,
      fetch: fetchFn as typeof globalThis.fetch,
    });
    await expect(backend.search("Patient")).rejects.toThrow(
      "SMART token request failed: HTTP 403",
    );
    await expect(backend.search("Patient")).rejects.not.toThrow(/search scope/);
  });

  it("reads the created id from an empty Epic body and a long Location", async () => {
    const id =
      "eQ36ru9st5pkcpWMMJBxjcxQNqRAVOaGy1aHFyggLA4VYxm5r2IvRWw96gM1SSwFs3";
    expect(id).toHaveLength(66);
    const fetchFn = vi.fn<typeof globalThis.fetch>(async () =>
        new Response(null, {
          status: 201,
          headers: {
            location: `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/Observation/${id}`,
          },
        }),
    );
    const backend = new EpicBackend({
      baseUrl: "https://fhir.example.test/R4",
      accessToken: "epic-test-token",
      fetch: fetchFn as typeof globalThis.fetch,
    });
    const created = await backend.createResource({
      resourceType: "Observation",
      status: "final",
      code: { text: "Pulse" },
    });
    expect(created.id).toBe(id);
    const headers = new Headers(fetchFn.mock.calls[0]?.[1]?.headers);
    expect(headers.get("content-type")).toBe("application/fhir+json");
    expect(headers.get("authorization")).toBe("Bearer epic-test-token");
  });

  it("turns a search 403 into a missing-search-scope error and still reads by id", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path.includes("/Observation/obs-1")) {
        return new Response(
          JSON.stringify({ resourceType: "Observation", id: "obs-1", status: "final" }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          resourceType: "OperationOutcome",
          issue: [{ diagnostics: "forbidden secret detail" }],
        }),
        { status: 403 },
      );
    });
    const backend = new EpicBackend({
      baseUrl: "https://fhir.example.test/R4",
      accessToken: "epic-test-token",
      fetch: fetchFn as typeof globalThis.fetch,
    });
    await expect(backend.search("Patient", { name: "Lopez" })).rejects.toThrow(
      EPIC_SEARCH_SCOPE_MESSAGE,
    );
    await expect(backend.search("Patient")).rejects.not.toThrow(/secret/);
    await expect(backend.readResource("Observation", "obs-1")).resolves.toMatchObject({
      id: "obs-1",
    });
  });
});
