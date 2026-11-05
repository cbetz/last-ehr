import { describe, it, expect, vi, afterEach } from "vitest";

// Mock the Medplum client: the factory tests only need MedplumBackend to be
// constructable and should not exercise the SDK's client behavior.
vi.mock("@medplum/core", () => ({
  MedplumClient: class {},
}));

import { AidboxBackend } from "@/lib/fhir/aidbox";
import { EpicBackend } from "@/lib/fhir/epic";
import { FirelyBackend } from "@/lib/fhir/firely";
import { HapiBackend } from "@/lib/fhir/hapi";
import { OracleHealthBackend } from "@/lib/fhir/oracle-health";
import { OystehrBackend } from "@/lib/fhir/oystehr";
import { createFhirBackend, hasFhirBackendConfig } from "@/lib/fhir/backend";
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
    vi.stubEnv("HAPI_BASE_URL", "");
    expect(() => createFhirBackend("tok")).toThrow("FHIR_BASE_URL");
  });

  it("lets an explicit name argument override FHIR_BACKEND", () => {
    vi.stubEnv("FHIR_BACKEND", "medplum");
    vi.stubEnv("HAPI_BASE_URL", "http://localhost:8080/fhir");
    expect(createFhirBackend("tok", "hapi")).toBeInstanceOf(HapiBackend);
  });

  it("rejects an unknown explicit name argument", () => {
    vi.stubEnv("FHIR_BACKEND", "medplum");
    expect(() => createFhirBackend("tok", "not-a-backend")).toThrow(
      "Unknown FHIR_BACKEND",
    );
  });

  it("prefers the per-backend base URL over the shared FHIR_BASE_URL", async () => {
    vi.stubEnv("FHIR_BASE_URL", "http://shared.example/fhir");
    vi.stubEnv("HAPI_BASE_URL", "http://hapi.example/fhir");
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ resourceType: "Bundle", type: "searchset" }), {
          headers: { "content-type": "application/fhir+json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await createFhirBackend("tok", "hapi").search("Patient");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://hapi.example/fhir/Patient",
      expect.anything(),
    );
  });

  it("falls back to the shared FHIR_BASE_URL when no per-backend URL is set", () => {
    vi.stubEnv("FHIR_BACKEND", "hapi");
    vi.stubEnv("FHIR_BASE_URL", "http://localhost:8080/fhir");
    vi.stubEnv("HAPI_BASE_URL", "");
    expect(createFhirBackend("tok")).toBeInstanceOf(HapiBackend);
  });

  it("reads the per-backend base URLs for firely and aidbox too", () => {
    vi.stubEnv("FHIR_BACKEND", "medplum");
    vi.stubEnv("FHIR_BASE_URL", "");

    vi.stubEnv("FIRELY_BASE_URL", "https://server.fire.ly");
    expect(createFhirBackend("tok", "firely")).toBeInstanceOf(FirelyBackend);

    vi.stubEnv("AIDBOX_BASE_URL", "http://localhost:8888/fhir");
    vi.stubEnv("AIDBOX_CLIENT_ID", "lastehr");
    vi.stubEnv("AIDBOX_CLIENT_SECRET", "secret");
    expect(createFhirBackend("tok", "aidbox")).toBeInstanceOf(AidboxBackend);
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

  it("selects Oystehr with M2M credentials and no base URL (SaaS default)", () => {
    vi.stubEnv("FHIR_BACKEND", "oystehr");
    vi.stubEnv("OYSTEHR_CLIENT_ID", "m2m");
    vi.stubEnv("OYSTEHR_CLIENT_SECRET", "secret");
    expect(createFhirBackend("tok")).toBeInstanceOf(OystehrBackend);
  });

  it("throws loudly when oystehr is selected without M2M credentials", () => {
    vi.stubEnv("FHIR_BACKEND", "oystehr");
    vi.stubEnv("OYSTEHR_CLIENT_ID", "");
    vi.stubEnv("OYSTEHR_CLIENT_SECRET", "");
    expect(() => createFhirBackend("tok")).toThrow("OYSTEHR_CLIENT_ID");
  });

  it("rejects unknown backends", () => {
    vi.stubEnv("FHIR_BACKEND", "not-a-backend");
    expect(() => createFhirBackend("tok")).toThrow("Unknown FHIR_BACKEND");
  });

  it("keeps the experimental sandbox adapters off unless the flag is set", () => {
    vi.stubEnv("LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS", "");
    vi.stubEnv("FHIR_BACKEND", "oracle-health");
    expect(() => createFhirBackend("tok")).toThrow(
      "LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS",
    );

    vi.stubEnv("LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS", "1");
    expect(createFhirBackend("tok")).toBeInstanceOf(OracleHealthBackend);

    vi.stubEnv("FHIR_BACKEND", "epic");
    vi.stubEnv("EPIC_CLIENT_ID", "");
    vi.stubEnv("EPIC_PRIVATE_KEY", "");
    vi.stubEnv("EPIC_ACCESS_TOKEN", "");
    expect(() => createFhirBackend("tok")).toThrow("EPIC_CLIENT_ID");

    vi.stubEnv("EPIC_ACCESS_TOKEN", "pre-minted");
    expect(createFhirBackend("tok")).toBeInstanceOf(EpicBackend);
  });

  it("builds an authenticated Oracle adapter from LASTEHR_* and keeps a partial config off", () => {
    vi.stubEnv("LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS", "1");
    vi.stubEnv("FHIR_BACKEND", "oracle-health");
    vi.stubEnv("LASTEHR_CLIENT_ID", "oracle-client");
    vi.stubEnv("LASTEHR_PRIVATE_KEY", "");
    vi.stubEnv("LASTEHR_PRIVATE_KEY_PATH", "");
    vi.stubEnv("LASTEHR_SCOPES", "");
    vi.stubEnv("ORACLE_ACCESS_TOKEN", "");
    expect(hasFhirBackendConfig("oracle-health")).toBe(false);
    expect(() => createFhirBackend("tok")).toThrow("LASTEHR_SCOPES");

    vi.stubEnv("LASTEHR_PRIVATE_KEY", "not-a-real-key");
    vi.stubEnv(
      "LASTEHR_SCOPES",
      "system/Observation.read system/Observation.write",
    );
    expect(hasFhirBackendConfig("oracle-health")).toBe(true);
    expect(createFhirBackend("tok")).toBeInstanceOf(OracleHealthBackend);
    expect(createFhirBackend("tok").writeDisposition).toBe("persist");
  });
});

describe("hasFhirBackendConfig", () => {
  it("mirrors what the factory needs to construct each adapter", () => {
    vi.stubEnv("FHIR_BACKEND", "medplum");
    vi.stubEnv("FHIR_BASE_URL", "");
    vi.stubEnv("HAPI_BASE_URL", "");
    vi.stubEnv("FIRELY_BASE_URL", "");
    vi.stubEnv("MEDPLUM_CLIENT_ID", "");
    vi.stubEnv("MEDPLUM_CLIENT_SECRET", "");
    vi.stubEnv("AIDBOX_BASE_URL", "");
    vi.stubEnv("AIDBOX_CLIENT_ID", "");
    vi.stubEnv("AIDBOX_CLIENT_SECRET", "");
    vi.stubEnv("OYSTEHR_CLIENT_ID", "");
    vi.stubEnv("OYSTEHR_CLIENT_SECRET", "");
    vi.stubEnv("LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS", "");
    vi.stubEnv("EPIC_ACCESS_TOKEN", "");
    vi.stubEnv("EPIC_CLIENT_ID", "");
    vi.stubEnv("EPIC_PRIVATE_KEY", "");
    expect(hasFhirBackendConfig("hapi")).toBe(false);
    expect(hasFhirBackendConfig("medplum")).toBe(false);
    expect(hasFhirBackendConfig("firely")).toBe(false);
    expect(hasFhirBackendConfig("aidbox")).toBe(false);
    expect(hasFhirBackendConfig("oystehr")).toBe(false);
    expect(hasFhirBackendConfig("oracle-health")).toBe(false);
    expect(hasFhirBackendConfig("epic")).toBe(false);
    expect(hasFhirBackendConfig("not-a-backend")).toBe(false);

    vi.stubEnv("HAPI_BASE_URL", "http://localhost:8080/fhir");
    expect(hasFhirBackendConfig("hapi")).toBe(true);
    vi.stubEnv("FIRELY_BASE_URL", "https://server.fire.ly");
    expect(hasFhirBackendConfig("firely")).toBe(true);

    // medplum needs the quickstart client credentials: a demo session picked
    // onto Medplum is only usable with a real minted token.
    vi.stubEnv("MEDPLUM_CLIENT_ID", "client");
    vi.stubEnv("MEDPLUM_CLIENT_SECRET", "secret");
    expect(hasFhirBackendConfig("medplum")).toBe(true);

    vi.stubEnv("AIDBOX_BASE_URL", "http://localhost:8888/fhir");
    vi.stubEnv("AIDBOX_CLIENT_ID", "lastehr");
    vi.stubEnv("AIDBOX_CLIENT_SECRET", "secret");
    expect(hasFhirBackendConfig("aidbox")).toBe(true);

    // Oystehr is SaaS-only: credentials alone are complete config — no
    // base URL requirement (the adapter defaults to the hosted endpoint).
    vi.stubEnv("OYSTEHR_CLIENT_ID", "m2m");
    vi.stubEnv("OYSTEHR_CLIENT_SECRET", "secret");
    expect(hasFhirBackendConfig("oystehr")).toBe(true);

    vi.stubEnv("LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS", "1");
    expect(hasFhirBackendConfig("oracle-health")).toBe(true);
    expect(hasFhirBackendConfig("epic")).toBe(false);
    vi.stubEnv("EPIC_CLIENT_ID", "non-prod");
    vi.stubEnv("EPIC_PRIVATE_KEY", "not-a-real-key");
    expect(hasFhirBackendConfig("epic")).toBe(true);
  });

  it("counts the shared FHIR_BASE_URL only for the deployment's own default", () => {
    // A non-default pick must name its own base URL; otherwise a
    // credential-less hapi pick could ride the shared fallback onto the
    // default backend's server through the wrong transport.
    vi.stubEnv("FHIR_BACKEND", "firely");
    vi.stubEnv("FHIR_BASE_URL", "https://firely.example/fhir");
    vi.stubEnv("HAPI_BASE_URL", "");
    vi.stubEnv("FIRELY_BASE_URL", "");
    expect(hasFhirBackendConfig("hapi")).toBe(false);
    expect(hasFhirBackendConfig("firely")).toBe(true);

    vi.stubEnv("FHIR_BACKEND", "hapi");
    expect(hasFhirBackendConfig("hapi")).toBe(true);
  });
});
