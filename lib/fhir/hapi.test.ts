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
import { defineFhirRestAdapterContract } from "@/test/fhir-rest-adapter-contract";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

defineFhirRestAdapterContract({
  name: "HapiBackend",
  createBackend: (baseUrl) => new HapiBackend(baseUrl),
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
