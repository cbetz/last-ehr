import { describe, it, expect, vi, afterEach } from "vitest";

// Mock the Medplum client: importing the real @medplum/core references
// WebSocket at module scope, which is not a global on Node 20 (the CI
// floor). The factory tests only need MedplumBackend to be constructable.
vi.mock("@medplum/core", () => ({
  MedplumClient: class {},
}));

import { HapiBackend } from "@/lib/fhir/hapi";
import { createFhirBackend } from "@/lib/fhir/backend";
import { MedplumBackend } from "@/lib/fhir/medplum";

function stubFetch(status: number, body: unknown | string) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("HapiBackend", () => {
  it("builds encoded query strings from structured params", async () => {
    const fetchFn = stubFetch(200, { resourceType: "Bundle", entry: [] });
    const backend = new HapiBackend("http://localhost:8080/fhir/");

    await backend.search("Patient", { name: "Smith & Sons", _count: "20" });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "http://localhost:8080/fhir/Patient?name=Smith+%26+Sons&_count=20",
    );
    expect(init.headers.accept).toBe("application/fhir+json");
  });

  it("searchResources keeps only match-mode entries with resources", async () => {
    stubFetch(200, {
      resourceType: "Bundle",
      entry: [
        { resource: { resourceType: "Patient", id: "p1" } },
        {
          resource: { resourceType: "Patient", id: "p2" },
          search: { mode: "match" },
        },
        {
          resource: { resourceType: "OperationOutcome", id: "warn" },
          search: { mode: "outcome" },
        },
        {
          resource: { resourceType: "Patient", id: "p3" },
          search: { mode: "include" },
        },
      ],
    });
    const backend = new HapiBackend("http://localhost:8080/fhir");

    const patients = await backend.searchResources("Patient", { _id: "p1" });
    expect(patients.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("createResource sends Prefer return=representation and returns the body", async () => {
    const fetchFn = stubFetch(201, {
      resourceType: "Observation",
      id: "obs-1",
      status: "final",
    });
    const backend = new HapiBackend("http://localhost:8080/fhir");

    const created = await backend.createResource({
      resourceType: "Observation",
      status: "final",
      code: { text: "Heart rate" },
    });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://localhost:8080/fhir/Observation");
    expect(init.method).toBe("POST");
    expect(init.headers.prefer).toBe("return=representation");
    expect(init.headers["content-type"]).toBe("application/fhir+json");
    expect(created.id).toBe("obs-1");
  });

  it("surfaces OperationOutcome diagnostics on errors", async () => {
    stubFetch(400, {
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", diagnostics: "Unknown search parameter" }],
    });
    const backend = new HapiBackend("http://localhost:8080/fhir");

    await expect(backend.search("Patient", { bogus: "x" })).rejects.toThrow(
      "FHIR request failed: Unknown search parameter",
    );
  });

  it("falls back to the HTTP status when the error body is not JSON", async () => {
    stubFetch(502, "Bad Gateway");
    const backend = new HapiBackend("http://localhost:8080/fhir");

    await expect(backend.search("Patient")).rejects.toThrow(
      "FHIR request failed: HTTP 502",
    );
  });

  it("deleteResource tolerates an empty 204 body", async () => {
    const fetchFn = stubFetch(204, "");
    const backend = new HapiBackend("http://localhost:8080/fhir");

    await expect(
      backend.deleteResource("Observation", "obs-1"),
    ).resolves.toBeUndefined();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://localhost:8080/fhir/Observation/obs-1");
    expect(init.method).toBe("DELETE");
  });
});

describe("createFhirBackend", () => {
  it("defaults to the Medplum adapter", () => {
    vi.stubEnv("FHIR_BACKEND", "");
    expect(createFhirBackend("tok")).toBeInstanceOf(MedplumBackend);
  });

  it("selects HAPI when configured with a base URL", () => {
    vi.stubEnv("FHIR_BACKEND", "hapi");
    vi.stubEnv("FHIR_BASE_URL", "http://localhost:8080/fhir");
    expect(createFhirBackend("tok")).toBeInstanceOf(HapiBackend);
  });

  it("throws loudly when hapi is selected without a base URL", () => {
    vi.stubEnv("FHIR_BACKEND", "hapi");
    vi.stubEnv("FHIR_BASE_URL", "");
    expect(() => createFhirBackend("tok")).toThrow("FHIR_BASE_URL");
  });

  it("rejects unknown backends", () => {
    vi.stubEnv("FHIR_BACKEND", "aidbox");
    expect(() => createFhirBackend("tok")).toThrow('Unknown FHIR_BACKEND');
  });
});
