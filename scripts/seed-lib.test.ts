import { describe, it, expect, vi } from "vitest";

// The wipe tests never construct a Medplum client, so keep the dependency
// mocked and focused on the seed cleanup behavior.
vi.mock("@medplum/core", () => ({
  MedplumClient: class {},
}));

import { wipePatient, CHILD_TYPES } from "@/scripts/seed-lib";
import type { FhirBackend } from "@/lib/fhir/backend";

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
