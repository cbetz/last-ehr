import { describe, it, expect, vi, afterEach } from "vitest";

// Mock the Medplum client: the factory tests only need MedplumBackend to be
// constructable and should not exercise the SDK's client behavior.
vi.mock("@medplum/core", () => ({
  MedplumClient: class {},
}));

import { AidboxBackend } from "@/lib/fhir/aidbox";
import { FirelyBackend } from "@/lib/fhir/firely";
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

  it("selects Firely when configured with a base URL", () => {
    vi.stubEnv("FHIR_BACKEND", "firely");
    vi.stubEnv("FHIR_BASE_URL", "https://server.fire.ly");
    expect(createFhirBackend("tok")).toBeInstanceOf(FirelyBackend);
  });

  it("selects Aidbox when configured with a base URL and client credentials", () => {
    vi.stubEnv("FHIR_BACKEND", "aidbox");
    vi.stubEnv("FHIR_BASE_URL", "http://localhost:8888/fhir");
    vi.stubEnv("AIDBOX_CLIENT_ID", "lastehr");
    vi.stubEnv("AIDBOX_CLIENT_SECRET", "secret");
    expect(createFhirBackend("tok")).toBeInstanceOf(AidboxBackend);
  });

  it("throws loudly when aidbox is selected without client credentials", () => {
    vi.stubEnv("FHIR_BACKEND", "aidbox");
    vi.stubEnv("FHIR_BASE_URL", "http://localhost:8888/fhir");
    vi.stubEnv("AIDBOX_CLIENT_ID", "");
    vi.stubEnv("AIDBOX_CLIENT_SECRET", "");
    expect(() => createFhirBackend("tok")).toThrow("AIDBOX_CLIENT_ID");
  });

  it("rejects unknown backends", () => {
    vi.stubEnv("FHIR_BACKEND", "not-a-backend");
    expect(() => createFhirBackend("tok")).toThrow("Unknown FHIR_BACKEND");
  });
});
