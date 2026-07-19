import { describe, expect, it, vi } from "vitest";

import { ScriptedDemoBackend } from "@/lib/fhir/scripted-demo";
import { SYNTHETIC_SYSTEM } from "@/lib/fhir/synthetic";

function backendStub() {
  return {
    search: vi.fn().mockResolvedValue({
      resourceType: "Bundle",
      entry: [
        {
          resource: {
            resourceType: "Patient",
            id: "maria-1",
            identifier: [
              { system: SYNTHETIC_SYSTEM, value: "synthetic-004" },
            ],
          },
        },
        {
          resource: {
            resourceType: "Patient",
            id: "someone-else",
            identifier: [{ system: SYNTHETIC_SYSTEM, value: "synthetic-001" }],
          },
        },
      ],
    }),
    searchResources: vi.fn().mockResolvedValue([
      {
        resourceType: "Patient",
        id: "maria-1",
        identifier: [{ system: SYNTHETIC_SYSTEM, value: "synthetic-004" }],
      },
    ]),
    createResource: vi.fn().mockImplementation(async (resource) => ({
      ...resource,
      id: "observation-1",
    })),
    deleteResource: vi.fn(),
  };
}

describe("ScriptedDemoBackend", () => {
  it("replaces patient searches with the seeded synthetic identifier", async () => {
    const backend = backendStub();
    const scripted = new ScriptedDemoBackend(backend);

    const bundle = await scripted.search("Patient", { name: "Someone else" });

    expect(backend.search).toHaveBeenCalledWith("Patient", {
      identifier: `${SYNTHETIC_SYSTEM}|synthetic-004`,
      _count: "1",
    });
    expect(bundle.entry).toHaveLength(1);
    expect(bundle.entry?.[0]?.resource?.id).toBe("maria-1");
  });

  it("rejects reads outside the scripted synthetic patient", async () => {
    const scripted = new ScriptedDemoBackend(backendStub());

    await expect(
      scripted.searchResources("Observation", { patient: "someone-else" }),
    ).rejects.toThrow("only its synthetic patient");
  });

  it("allows only the fixed observation for the seeded patient", async () => {
    const backend = backendStub();
    const scripted = new ScriptedDemoBackend(backend, "session-A");

    await expect(
      scripted.createResource({
        resourceType: "Observation",
        status: "final",
        code: { text: "Heart rate" },
        subject: { reference: "Patient/maria-1" },
        valueQuantity: {
          value: 72,
          unit: "bpm",
          system: "http://unitsofmeasure.org",
          code: "bpm",
        },
        extension: [{ url: "https://example.test/unwanted", valueString: "nope" }],
      }),
    ).resolves.toMatchObject({ id: "observation-1" });
    expect(backend.createResource).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: {
          // The wrapper rebuilds meta from scratch, so the AIAST label must
          // be stamped here or scripted-mode writes lose their AI marking.
          security: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v3-ObservationValue",
              code: "AIAST",
              display: "Artificial Intelligence asserted",
            },
          ],
          tag: [{ system: "http://lastehr.demo", code: "session-session-A" }],
        },
      }),
    );
    expect(backend.createResource).toHaveBeenCalledWith(
      expect.not.objectContaining({ extension: expect.anything() }),
    );
    await expect(
      scripted.createResource({
        resourceType: "Observation",
        status: "final",
        code: { text: "Blood pressure" },
        subject: { reference: "Patient/maria-1" },
        valueQuantity: {
          value: 120,
          unit: "mmHg",
          system: "http://unitsofmeasure.org",
          code: "mmHg",
        },
      }),
    ).rejects.toThrow("fixed synthetic heart-rate observation");
  });
});
