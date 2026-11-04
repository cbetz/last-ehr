import { describe, expect, it, vi } from "vitest";
import type { Observation } from "@medplum/fhirtypes";

import type { FhirBackend } from "./backend";
import { describeApprovedWriteOutput, DRY_RUN_OUTCOME } from "./dry-run-result";
import {
  commitApprovedWrite,
  diffProposedResource,
  listStagedWrites,
} from "./dry-run-write";

const observation = {
  resourceType: "Observation" as const,
  status: "final" as const,
  code: { text: "Heart rate" },
  valueQuantity: { value: 72, unit: "bpm" },
};

describe("dry-run writes", () => {
  it("diffs a create against an empty server and does not invent an id", () => {
    const diff = diffProposedResource(observation);
    expect(diff.startsWith("--- (not on the FHIR server)")).toBe(true);
    expect(diff).toContain("+++ staged Observation (not written)");
    expect(diff).toContain('"resourceType": "Observation"');
    expect(diff).not.toContain('"id"');
  });

  it("stages on approval and does not call createResource", async () => {
    const createResource = vi.fn();
    const backend = {
      writeDisposition: "dry-run" as const,
      search: vi.fn(),
      searchResources: vi.fn(),
      createResource,
      deleteResource: vi.fn(),
    } satisfies FhirBackend;

    const committed = await commitApprovedWrite(backend, observation);

    expect(createResource).not.toHaveBeenCalled();
    expect(committed.persisted).toBe(false);
    if (committed.persisted) return;
    expect(committed.stagedId.startsWith("dry-run-")).toBe(true);
    expect(listStagedWrites(backend)).toEqual([
      expect.objectContaining({
        stagedId: committed.stagedId,
        resourceType: "Observation",
        resource: observation,
      }),
    ]);
    expect(
      describeApprovedWriteOutput("Observation recorded.", {
        ...committed,
        summary: "Heart rate: 72 bpm",
        outcome: DRY_RUN_OUTCOME,
      }),
    ).toEqual({
      persisted: false,
      message: DRY_RUN_OUTCOME,
      diff: committed.diff,
    });
  });

  it("persists through createResource when the backend is not dry-run", async () => {
    const created = { ...observation, id: "obs-1" } as Observation & {
      id: string;
    };
    const backend = {
      search: vi.fn(),
      searchResources: vi.fn(),
      createResource: vi.fn().mockResolvedValue(created),
      deleteResource: vi.fn(),
    } satisfies FhirBackend;

    await expect(commitApprovedWrite(backend, observation)).resolves.toEqual({
      persisted: true,
      resource: created,
    });
    expect(backend.createResource).toHaveBeenCalledWith(observation);
    expect(
      describeApprovedWriteOutput("Observation recorded.", {
        id: "obs-1",
        resourceType: "Observation",
      }),
    ).toEqual({ persisted: true, message: "Observation recorded." });
  });
});
