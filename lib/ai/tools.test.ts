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
    // Observation, Communication, MedicationRequest, Immunization.
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
      ])
      .mockResolvedValueOnce([
        {
          id: "m1",
          medicationCodeableConcept: { text: "Metformin 500 mg tablet" },
          dosageInstruction: [{ text: "1 tablet twice daily" }],
          status: "active",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "im1",
          vaccineCode: { text: "Influenza, seasonal" },
          occurrenceDateTime: "2025-10-15T00:00:00Z",
        },
      ]);

    const tools = buildTools("test-token");
    const out = await (
      tools.show_patient_info.execute as unknown as (
        input: unknown,
        opts: unknown,
      ) => Promise<{
        patient: { id?: string };
        conditions: unknown[];
        allergies: unknown[];
        observations: unknown[];
        notes: unknown[];
        medications: unknown[];
        immunizations: unknown[];
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
    expect(out.medications).toEqual([
      {
        id: "m1",
        text: "Metformin 500 mg tablet",
        dosage: "1 tablet twice daily",
        status: "active",
      },
    ]);
    expect(out.immunizations).toEqual([
      { id: "im1", text: "Influenza, seasonal", date: "2025-10-15" },
    ]);
  });

  it("record_observation tags the write with the session id", async () => {
    createResource.mockResolvedValue({ id: "obs-1" });
    const tools = buildTools("test-token", "A");

    await (
      tools.record_observation.execute as (
        input: unknown,
        opts: unknown,
      ) => unknown
    )({ patientId: "p2", label: "Body weight", value: 70, unit: "kg" }, {});

    expect(createResource).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: { tag: [{ system: "http://lastehr.demo", code: "session-A" }] },
      }),
    );
  });

  it("show_patient_info hides other sessions' writes but keeps seed data and its own", async () => {
    readResource.mockResolvedValue({ resourceType: "Patient", id: "p9" });
    searchResources
      .mockResolvedValueOnce([]) // Condition
      .mockResolvedValueOnce([]) // AllergyIntolerance
      .mockResolvedValueOnce([
        {
          id: "seed",
          code: { text: "Body temperature" },
          valueQuantity: { value: 37, unit: "C" },
          effectiveDateTime: "2026-01-01T00:00:00Z",
        },
        {
          id: "mine",
          code: { text: "Heart rate" },
          valueQuantity: { value: 72, unit: "bpm" },
          effectiveDateTime: "2026-06-01T00:00:00Z",
          meta: {
            tag: [{ system: "http://lastehr.demo", code: "session-A" }],
          },
        },
        {
          id: "other",
          code: { text: "Junk" },
          valueQuantity: { value: 999, unit: "x" },
          effectiveDateTime: "2026-06-02T00:00:00Z",
          meta: {
            tag: [{ system: "http://lastehr.demo", code: "session-B" }],
          },
        },
      ]) // Observation
      .mockResolvedValueOnce([
        {
          id: "note-seed",
          payload: [{ contentString: "seed note" }],
          sent: "2026-01-01T00:00:00Z",
        },
        {
          id: "note-other",
          payload: [{ contentString: "other note" }],
          sent: "2026-06-02T00:00:00Z",
          meta: {
            tag: [{ system: "http://lastehr.demo", code: "session-B" }],
          },
        },
      ]) // Communication
      .mockResolvedValueOnce([
        {
          id: "med-seed",
          medicationCodeableConcept: { text: "Lisinopril 10 mg tablet" },
          dosageInstruction: [{ text: "once daily" }],
          status: "active",
        },
        {
          id: "med-other",
          medicationCodeableConcept: { text: "Junk med" },
          status: "active",
          meta: {
            tag: [{ system: "http://lastehr.demo", code: "session-B" }],
          },
        },
      ]) // MedicationRequest
      .mockResolvedValueOnce([
        {
          id: "imm-seed",
          vaccineCode: { text: "Influenza, seasonal" },
          occurrenceDateTime: "2025-10-15T00:00:00Z",
        },
      ]); // Immunization

    const tools = buildTools("test-token", "A");
    const out = await (
      tools.show_patient_info.execute as unknown as (
        input: unknown,
        opts: unknown,
      ) => Promise<{
        observations: { id: string }[];
        notes: { id: string }[];
        medications: { id: string }[];
        immunizations: { id: string }[];
      }>
    )({ id: "p9" }, {});

    expect(out.observations.map((o) => o.id)).toEqual(["seed", "mine"]);
    expect(out.notes.map((n) => n.id)).toEqual(["note-seed"]);
    expect(out.medications.map((m) => m.id)).toEqual(["med-seed"]);
    expect(out.immunizations.map((i) => i.id)).toEqual(["imm-seed"]);
  });
});
