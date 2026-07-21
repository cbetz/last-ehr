import { afterEach, describe, it, expect, vi } from "vitest";

// The wipe tests never construct a Medplum client, so keep the dependency
// mocked and focused on the seed cleanup behavior.
vi.mock("@medplum/core", () => ({
  MedplumClient: class {},
}));

import {
  createSeedBackend,
  wipePatient,
  CHILD_TYPES,
} from "@/scripts/seed-lib";
import { AidboxBackend } from "@/lib/fhir/aidbox";
import type { FhirBackend } from "@/lib/fhir/backend";
import { FirelyBackend } from "@/lib/fhir/firely";
import { HapiBackend } from "@/lib/fhir/hapi";
import { OystehrBackend } from "@/lib/fhir/oystehr";

function fakeBackend(overrides: Partial<Record<keyof FhirBackend, unknown>>) {
  return {
    search: vi.fn(),
    searchResources: vi.fn().mockResolvedValue([]),
    createResource: vi.fn(),
    deleteResource: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as FhirBackend & {
    searchResources: ReturnType<typeof vi.fn>;
    deleteResource: ReturnType<typeof vi.fn>;
  };
}

describe("wipePatient", () => {
  it("pages child deletes until the search drains, then deletes the patient", async () => {
    // Observation returns two pages then empty; everything else empty.
    const obsPages = [
      [{ resourceType: "Observation", id: "o1" }],
      [{ resourceType: "Observation", id: "o2" }],
      [],
    ];
    const backend = fakeBackend({
      searchResources: vi.fn().mockImplementation(async (type: string) => {
        if (type === "Patient")
          return [{ resourceType: "Patient", id: "p1" }];
        if (type === "Observation") return obsPages.shift() ?? [];
        return [];
      }),
    });

    await wipePatient(backend, "john");

    const deletes = backend.deleteResource.mock.calls;
    expect(deletes).toContainEqual(["Observation", "o1"]);
    expect(deletes).toContainEqual(["Observation", "o2"]);
    // Patient goes last.
    expect(deletes[deletes.length - 1]).toEqual(["Patient", "p1"]);
  });

  it("bails out of a page with nothing deletable instead of looping forever", async () => {
    const backend = fakeBackend({
      searchResources: vi.fn().mockImplementation(async (type: string) => {
        if (type === "Patient")
          return [{ resourceType: "Patient", id: "p1" }];
        // A pathological page whose entries carry no ids, every time.
        if (type === "Condition") return [{ resourceType: "Condition" }];
        return [];
      }),
    });

    await wipePatient(backend, "john");

    // One search per non-Condition child type, two for the Condition retry
    // guard at most; the real assertion is that we got here at all (no
    // infinite loop) and the patient still got deleted.
    expect(backend.deleteResource).toHaveBeenCalledWith("Patient", "p1");
  });

  it("wraps a failed patient delete in an actionable error", async () => {
    const backend = fakeBackend({
      searchResources: vi.fn().mockImplementation(async (type: string) =>
        type === "Patient" ? [{ resourceType: "Patient", id: "p1" }] : [],
      ),
      deleteResource: vi.fn().mockImplementation(async (type: string) => {
        if (type === "Patient") throw new Error("HTTP 409");
      }),
    });

    await expect(wipePatient(backend, "john")).rejects.toThrow(
      "Could not delete Patient/p1",
    );
  });

  it("does nothing when no synthetic patient matches", async () => {
    const backend = fakeBackend({});
    await wipePatient(backend, "ghost");
    expect(backend.deleteResource).not.toHaveBeenCalled();
  });

  it("covers every child type the chart card renders", () => {
    for (const type of [
      "Communication",
      "Observation",
      "Condition",
      "AllergyIntolerance",
      "MedicationRequest",
      "Immunization",
    ]) {
      expect(CHILD_TYPES).toContain(type);
    }
  });
});

describe("createSeedBackend", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("selects HAPI from the per-backend or shared URL, no confirmation needed", async () => {
    vi.stubEnv("FHIR_BACKEND", "hapi");
    vi.stubEnv("HAPI_BASE_URL", "http://localhost:8080/fhir");
    const { backend, target } = await createSeedBackend();
    expect(backend).toBeInstanceOf(HapiBackend);
    expect(target).toBe("http://localhost:8080/fhir");
  });

  it("fails closed on adapter targets without the synthetic confirmation", async () => {
    // The seed deletes and recreates matching charts, so firely/aidbox
    // mirror the safety eval's --confirm-synthetic posture.
    vi.stubEnv("FHIR_BACKEND", "firely");
    vi.stubEnv("FIRELY_BASE_URL", "https://server.fire.ly");
    await expect(createSeedBackend()).rejects.toThrow("--confirm-synthetic");
  });

  it("selects Firely with the confirmation and a base URL", async () => {
    vi.stubEnv("FHIR_BACKEND", "firely");
    vi.stubEnv("FIRELY_BASE_URL", "https://server.fire.ly");
    const { backend } = await createSeedBackend({
      confirmSyntheticTarget: true,
    });
    expect(backend).toBeInstanceOf(FirelyBackend);
  });

  it("selects Aidbox with the confirmation, URL, and client credentials", async () => {
    vi.stubEnv("FHIR_BACKEND", "aidbox");
    vi.stubEnv("AIDBOX_BASE_URL", "http://localhost:8888/fhir");
    vi.stubEnv("AIDBOX_CLIENT_ID", "lastehr");
    vi.stubEnv("AIDBOX_CLIENT_SECRET", "secret");
    const { backend } = await createSeedBackend({
      confirmSyntheticTarget: true,
    });
    expect(backend).toBeInstanceOf(AidboxBackend);
  });

  it("throws loudly when aidbox credentials are missing", async () => {
    vi.stubEnv("FHIR_BACKEND", "aidbox");
    vi.stubEnv("AIDBOX_BASE_URL", "http://localhost:8888/fhir");
    vi.stubEnv("AIDBOX_CLIENT_ID", "");
    vi.stubEnv("AIDBOX_CLIENT_SECRET", "");
    await expect(
      createSeedBackend({ confirmSyntheticTarget: true }),
    ).rejects.toThrow("AIDBOX_CLIENT_ID");
  });

  it("selects Oystehr with the confirmation and M2M credentials", async () => {
    vi.stubEnv("FHIR_BACKEND", "oystehr");
    vi.stubEnv("OYSTEHR_CLIENT_ID", "m2m");
    vi.stubEnv("OYSTEHR_CLIENT_SECRET", "secret");
    const { backend } = await createSeedBackend({
      confirmSyntheticTarget: true,
    });
    expect(backend).toBeInstanceOf(OystehrBackend);
  });

  it("fails closed on oystehr without the synthetic confirmation", async () => {
    vi.stubEnv("FHIR_BACKEND", "oystehr");
    vi.stubEnv("OYSTEHR_CLIENT_ID", "m2m");
    vi.stubEnv("OYSTEHR_CLIENT_SECRET", "secret");
    await expect(createSeedBackend()).rejects.toThrow("--confirm-synthetic");
  });

  it("rejects unknown backends, listing every supported value", async () => {
    vi.stubEnv("FHIR_BACKEND", "not-a-backend");
    await expect(createSeedBackend()).rejects.toThrow(
      "medplum, hapi, firely, aidbox, oystehr",
    );
  });

  it("still requires Medplum credentials for the default backend", async () => {
    vi.stubEnv("FHIR_BACKEND", "");
    vi.stubEnv("MEDPLUM_ACCESS_TOKEN", "");
    vi.stubEnv("MEDPLUM_CLIENT_ID", "");
    vi.stubEnv("MEDPLUM_CLIENT_SECRET", "");
    await expect(createSeedBackend()).rejects.toThrow("MEDPLUM_CLIENT_ID");
  });
});
