import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Medplum so the write tools' execute() doesn't hit a real server.
// vi.hoisted ensures these exist before the (hoisted) vi.mock factory runs.
const { createResource, search, readResource, searchResources } = vi.hoisted(
  () => ({
    createResource: vi.fn(),
    search: vi.fn(),
    readResource: vi.fn(),
    searchResources: vi.fn(),
  }),
);

vi.mock("@medplum/core", () => ({
  // A class so `new MedplumClient(...)` is constructable.
  MedplumClient: class {
    createResource = createResource;
    search = search;
    readResource = readResource;
    searchResources = searchResources;
  },
}));

import { buildTools } from "@/lib/ai/tools";

describe("agent FHIR tools", () => {
  beforeEach(() => {
    createResource.mockReset();
    readResource.mockReset();
    searchResources.mockReset();
  });

  it("gates writes behind approval, but never reads", () => {
    const tools = buildTools("test-token");
    // The core safety property: writes require explicit approval.
    expect(tools.add_note.needsApproval).toBe(true);
    expect(tools.record_observation.needsApproval).toBe(true);
    // Reads execute freely.
    expect(tools.search_patients.needsApproval).toBeFalsy();
    expect(tools.show_patient_info.needsApproval).toBeFalsy();
  });

  it("add_note writes a Communication scoped to the named patient", async () => {
    createResource.mockResolvedValue({ id: "comm-1" });
    const tools = buildTools("test-token");

    await (tools.add_note.execute as (input: unknown, opts: unknown) => unknown)(
      { patientId: "p1", text: "follow up in two weeks" },
      {},
    );

    expect(createResource).toHaveBeenCalledTimes(1);
    expect(createResource).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: "Communication",
        subject: { reference: "Patient/p1" },
        payload: [{ contentString: "follow up in two weeks" }],
      }),
    );
  });

  it("record_observation writes an Observation with the value and unit", async () => {
    createResource.mockResolvedValue({ id: "obs-1" });
    const tools = buildTools("test-token");

    await (
      tools.record_observation.execute as (
        input: unknown,
        opts: unknown,
      ) => unknown
    )({ patientId: "p2", label: "Body weight", value: 70, unit: "kg" }, {});

    expect(createResource).toHaveBeenCalledTimes(1);
    expect(createResource).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: "Observation",
        subject: { reference: "Patient/p2" },
        valueQuantity: expect.objectContaining({ value: 70, unit: "kg" }),
      }),
    );
  });

  it("show_patient_info returns the patient's real conditions, allergies, observations, and notes", async () => {
    readResource.mockResolvedValue({
      resourceType: "Patient",
      id: "p9",
      name: [{ given: ["Maria"], family: "Garcia" }],
    });
    // searchResources is called in order: Condition, AllergyIntolerance,
    // Observation, Communication.
    searchResources
      .mockResolvedValueOnce([{ id: "c1", code: { text: "Asthma" } }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "o1",
          code: { text: "Heart rate" },
          valueQuantity: { value: 72, unit: "/min" },
          effectiveDateTime: "2026-01-28T10:00:00Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "n1",
          payload: [{ contentString: "follow up" }],
          sent: "2026-02-01T00:00:00Z",
        },
      ]);

    const tools = buildTools("test-token");
    const out = await (
      tools.show_patient_info.execute as (
        input: unknown,
        opts: unknown,
      ) => Promise<{
        patient: { id?: string };
        conditions: unknown[];
        allergies: unknown[];
        observations: unknown[];
        notes: unknown[];
      }>
    )({ id: "p9" }, {});

    expect(out.patient.id).toBe("p9");
    expect(out.conditions).toEqual([{ id: "c1", text: "Asthma" }]);
    expect(out.allergies).toEqual([]);
    expect(out.observations).toEqual([
      { id: "o1", label: "Heart rate", value: "72 /min", date: "2026-01-28" },
    ]);
    expect(out.notes).toEqual([
      { id: "n1", text: "follow up", date: "2026-02-01" },
    ]);
  });
});
