import { afterEach, describe, expect, it, vi } from "vitest";

import type { FhirBackend } from "@/lib/fhir/backend";

export type FhirRestAdapterContractOptions = {
  name: string;
  createBackend: (baseUrl: string) => FhirBackend;
  /** Headers required by the adapter, such as a bearer token. */
  expectedHeaders?: HeadersInit;
};

function stubFetch(status: number, body: unknown | string) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function requestHeaders(fetch: ReturnType<typeof stubFetch>): Headers {
  const [, init] = fetch.mock.calls[0] as [string, RequestInit];
  return new Headers(init.headers);
}

/**
 * Shared wire-level contract for REST-style FHIR adapters. It runs entirely
 * against mocked fetch, so contributors can get a green baseline without an
 * account, Docker image, or real patient data. Target-specific integration
 * tests still belong in the adapter PR.
 */
export function defineFhirRestAdapterContract({
  name,
  createBackend,
  expectedHeaders,
}: FhirRestAdapterContractOptions): void {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe(`${name} REST adapter contract`, () => {
    const baseUrl = "http://fhir.example.test/fhir/";

    const expectCommonHeaders = (fetch: ReturnType<typeof stubFetch>) => {
      const headers = requestHeaders(fetch);
      expect(headers.get("accept")).toBe("application/fhir+json");
      for (const [name, value] of new Headers(expectedHeaders)) {
        expect(headers.get(name)).toBe(value);
      }
    };

    it("uses collection search with URL-encoded structured parameters", async () => {
      const fetch = stubFetch(200, { resourceType: "Bundle", entry: [] });
      const backend = createBackend(baseUrl);

      await backend.search("Patient", { name: "Smith & Sons", _count: "20" });

      expect(fetch.mock.calls[0]?.[0]).toBe(
        "http://fhir.example.test/fhir/Patient?name=Smith+%26+Sons&_count=20",
      );
      expectCommonHeaders(fetch);
    });

    it("uses search for _id lookups and excludes include/outcome resources", async () => {
      const fetch = stubFetch(200, {
        resourceType: "Bundle",
        entry: [
          { resource: { resourceType: "Patient", id: "p1" } },
          {
            resource: { resourceType: "Patient", id: "p2" },
            search: { mode: "match" },
          },
          {
            resource: { resourceType: "OperationOutcome", id: "warning" },
            search: { mode: "outcome" },
          },
          {
            resource: { resourceType: "Patient", id: "p3" },
            search: { mode: "include" },
          },
        ],
      });
      const backend = createBackend(baseUrl);

      const patients = await backend.searchResources("Patient", {
        _id: "p1",
        _count: "1",
      });

      expect(fetch.mock.calls[0]?.[0]).toBe(
        "http://fhir.example.test/fhir/Patient?_id=p1&_count=1",
      );
      expect(patients.map((patient) => patient.id)).toEqual(["p1", "p2"]);
    });

    it("posts an Observation with meta.tag intact and returns its assigned id", async () => {
      const fetch = stubFetch(201, {
        resourceType: "Observation",
        id: "observation-1",
        status: "final",
      });
      const backend = createBackend(baseUrl);
      const resource = {
        resourceType: "Observation" as const,
        status: "final" as const,
        code: { text: "Adapter contract" },
        meta: {
          tag: [{ system: "https://lastehr.com/test", code: "session-1" }],
        },
      };

      const created = await backend.createResource(resource);

      expect(fetch.mock.calls[0]?.[0]).toBe(
        "http://fhir.example.test/fhir/Observation",
      );
      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      const headers = new Headers(init.headers);
      expect(headers.get("content-type")).toBe("application/fhir+json");
      expect(headers.get("prefer")).toBe("return=representation");
      expect(JSON.parse(String(init.body))).toEqual(resource);
      expect(created.id).toBe("observation-1");
    });

    it("surfaces OperationOutcome diagnostics and plain HTTP failures", async () => {
      stubFetch(400, {
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", diagnostics: "Unknown search parameter" }],
      });
      await expect(
        createBackend(baseUrl).search("Patient", { bogus: "x" }),
      ).rejects.toThrow("FHIR request failed: Unknown search parameter");

      stubFetch(502, "Bad Gateway");
      await expect(createBackend(baseUrl).search("Patient")).rejects.toThrow(
        "FHIR request failed: HTTP 502",
      );
    });

    it("attaches the numeric statusCode to failures for structured consumers", async () => {
      // The log scrubber and the dev-output observer read error.statusCode;
      // it must be the bare number, never part of a richer payload.
      stubFetch(404, {
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", diagnostics: "Not found" }],
      });
      await expect(
        createBackend(baseUrl).search("Patient", { _id: "nope" }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("requires a representation with an id after a create", async () => {
      stubFetch(201, "");
      await expect(
        createBackend(baseUrl).createResource({
          resourceType: "Observation",
          status: "final",
          code: { text: "Adapter contract" },
        }),
      ).rejects.toThrow("FHIR create response did not include a resource id");
    });

    it("deletes resources and tolerates an empty 204 response", async () => {
      const fetch = stubFetch(204, "");
      const backend = createBackend(baseUrl);

      await expect(
        backend.deleteResource("Observation", "observation-1"),
      ).resolves.toBeUndefined();
      expect(fetch.mock.calls[0]?.[0]).toBe(
        "http://fhir.example.test/fhir/Observation/observation-1",
      );
      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("DELETE");
      expectCommonHeaders(fetch);
    });
  });
}
