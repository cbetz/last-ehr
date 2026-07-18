import { describe, it, expect, vi, beforeEach } from "vitest";

import { buildTools } from "@/lib/ai/tools";
import type { FhirBackend } from "@/lib/fhir/backend";

// buildTools takes the backend as a plain object, so tests inject a fake
// directly; no module mocking required. Adapter behavior (client construction,
// delegation) is covered in lib/fhir/medplum.test.ts.
const search = vi.fn();
const searchResources = vi.fn();
const createResource = vi.fn();
const deleteResource = vi.fn();
const backend = {
  search,
  searchResources,
  createResource,
  deleteResource,
} as FhirBackend;

describe("agent FHIR tools", () => {
  beforeEach(() => {
    search.mockReset();
    createResource.mockReset();
    searchResources.mockReset();
  });

  it("gates writes behind approval, but never reads", () => {
    const tools = buildTools(backend);
    // The core safety property: writes require explicit approval.
    expect(tools.add_note.needsApproval).toBe(true);
    expect(tools.record_observation.needsApproval).toBe(true);
    // Reads execute freely.
    expect(tools.search_patients.needsApproval).toBeFalsy();
    expect(tools.show_patient_info.needsApproval).toBeFalsy();
  });

  it("search_patients passes the name as a structured param, never a query string", async () => {
    search.mockResolvedValue({ entry: [] });
    const tools = buildTools(backend);

    await (
      tools.search_patients.execute as (input: unknown, opts: unknown) => unknown
    )({ name: "Smith & Sons" }, {});

    expect(search).toHaveBeenCalledWith("Patient", {
      name: "Smith & Sons",
      _count: "20",
    });
  });

  it("add_note writes a Communication scoped to the named patient", async () => {
    createResource.mockResolvedValue({ id: "comm-1" });
    const tools = buildTools(backend);

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
    const tools = buildTools(backend);

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
    // searchResources is called in order: Patient (by _id; a search rather
    // than a read so compartment-scoped SMART sessions work), Condition,
    // AllergyIntolerance, Observation, Communication, MedicationRequest,
    // Immunization.
    searchResources
      .mockResolvedValueOnce([
        {
          resourceType: "Patient",
          id: "p9",
          name: [{ given: ["Maria"], family: "Garcia" }],
        },
      ])
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

    const tools = buildTools(backend);
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
    // Notes carry the untrusted-content boundary the system prompt names;
    // the chart UI strips it for display.
    expect(out.notes).toEqual([
      { id: "n1", text: "<chart_text>follow up</chart_text>", date: "2026-02-01" },
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
    const tools = buildTools(backend, "A");

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

  it("show_patient_info scopes Observation/Communication queries to visible rows and keeps seed data and its own", async () => {
    // The written-to chart lists (Observation, Communication) must carry the
    // visibility rule in the query itself: an untagged (seed) search plus an
    // own-session-tag search. Filtering only after the fetch would let other
    // sessions' rows consume the _count window.
    searchResources.mockImplementation(
      async (type: string, params: Record<string, string> = {}) => {
        if (type === "Patient") return [{ resourceType: "Patient", id: "p9" }];
        if (type === "Observation") {
          if (params["_tag:not"] === "http://lastehr.demo|") {
            return [
              {
                id: "seed",
                code: { text: "Body temperature" },
                valueQuantity: { value: 37, unit: "C" },
                effectiveDateTime: "2026-01-01T00:00:00Z",
              },
            ];
          }
          if (params._tag === "http://lastehr.demo|session-A") {
            return [
              {
                id: "mine",
                code: { text: "Heart rate" },
                valueQuantity: { value: 72, unit: "bpm" },
                effectiveDateTime: "2026-06-01T00:00:00Z",
                meta: {
                  tag: [{ system: "http://lastehr.demo", code: "session-A" }],
                },
              },
            ];
          }
          throw new Error("Observation query is missing the visibility params");
        }
        if (type === "Communication") {
          if (params["_tag:not"] === "http://lastehr.demo|") {
            return [
              {
                id: "note-seed",
                payload: [{ contentString: "seed note" }],
                sent: "2026-01-01T00:00:00Z",
              },
            ];
          }
          if (params._tag === "http://lastehr.demo|session-A") return [];
          throw new Error(
            "Communication query is missing the visibility params",
          );
        }
        if (type === "MedicationRequest") {
          return [
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
          ];
        }
        if (type === "Immunization") {
          return [
            {
              id: "imm-seed",
              vaccineCode: { text: "Influenza, seasonal" },
              occurrenceDateTime: "2025-10-15T00:00:00Z",
            },
          ];
        }
        return [];
      },
    );

    const tools = buildTools(backend, "A");
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

    // Merged across the two scoped queries and re-sorted newest-first.
    expect(out.observations.map((o) => o.id)).toEqual(["mine", "seed"]);
    expect(out.notes.map((n) => n.id)).toEqual(["note-seed"]);
    expect(out.medications.map((m) => m.id)).toEqual(["med-seed"]);
    expect(out.immunizations.map((i) => i.id)).toEqual(["imm-seed"]);
  });

  it("show_patient_info still hides other sessions' rows when a backend ignores the :not modifier", async () => {
    // A server that silently drops _tag:not answers the seed query with every
    // row. The post-fetch isVisible filter must still hide other sessions'
    // writes, degrading to the old behavior rather than leaking them.
    searchResources.mockImplementation(
      async (type: string, params: Record<string, string> = {}) => {
        if (type === "Patient") return [{ resourceType: "Patient", id: "p9" }];
        if (type === "Observation") {
          if (params._tag === "http://lastehr.demo|session-A") return [];
          return [
            {
              id: "seed",
              code: { text: "Body temperature" },
              valueQuantity: { value: 37, unit: "C" },
              effectiveDateTime: "2026-01-01T00:00:00Z",
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
          ];
        }
        return [];
      },
    );

    const tools = buildTools(backend, "A");
    const out = await (
      tools.show_patient_info.execute as unknown as (
        input: unknown,
        opts: unknown,
      ) => Promise<{ observations: { id: string }[] }>
    )({ id: "p9" }, {});

    expect(out.observations.map((o) => o.id)).toEqual(["seed"]);
  });

  it("show_patient_info falls back when a backend rejects the :not modifier", async () => {
    // HAPI rejects the bare-system token (_tag:not=system|) with HAPI-1218
    // instead of honoring or ignoring it. searchVisible must rerun the seed
    // query unfiltered and let isVisible hide other sessions' rows — not
    // fail the whole chart view.
    searchResources.mockImplementation(
      async (type: string, params: Record<string, string> = {}) => {
        if (type === "Patient") return [{ resourceType: "Patient", id: "p9" }];
        if (type === "Observation") {
          if (params["_tag:not"]) {
            throw new Error(
              "FHIR request failed: HAPI-1218: Missing _tag parameter (must supply a value/code and not just a system)",
            );
          }
          if (params._tag === "http://lastehr.demo|session-A") {
            return [
              {
                id: "own",
                code: { text: "Heart rate" },
                valueQuantity: { value: 72, unit: "bpm" },
                effectiveDateTime: "2026-06-03T00:00:00Z",
                meta: {
                  tag: [{ system: "http://lastehr.demo", code: "session-A" }],
                },
              },
            ];
          }
          // The unfiltered fallback returns everything, own row included:
          // the dedupe and visibility passes must sort it out.
          return [
            {
              id: "seed",
              code: { text: "Body temperature" },
              valueQuantity: { value: 37, unit: "C" },
              effectiveDateTime: "2026-01-01T00:00:00Z",
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
            {
              id: "own",
              code: { text: "Heart rate" },
              valueQuantity: { value: 72, unit: "bpm" },
              effectiveDateTime: "2026-06-03T00:00:00Z",
              meta: {
                tag: [{ system: "http://lastehr.demo", code: "session-A" }],
              },
            },
          ];
        }
        return [];
      },
    );

    const tools = buildTools(backend, "A");
    const out = await (
      tools.show_patient_info.execute as unknown as (
        input: unknown,
        opts: unknown,
      ) => Promise<{ observations: { id: string }[] }>
    )({ id: "p9" }, {});

    expect(out.observations.map((o) => o.id)).toEqual(["own", "seed"]);
  });
});
