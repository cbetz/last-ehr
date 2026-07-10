import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Observation, Patient } from "@medplum/fhirtypes";

import type { FhirBackend } from "@/lib/fhir/backend";

// Deliberately separate from the repository's seed identifiers. Contract tests
// create and remove their own records, so adapter authors can point the harness
// at an otherwise empty synthetic test project without depending on this repo's
// demo fixtures.
const CONTRACT_SYSTEM = "https://lastehr.com/adapter-contract";

export type FhirBackendContractOptions = {
  /** Human-readable backend name, shown in test output. */
  name: string;
  /** Construct an authenticated backend aimed at a disposable synthetic test target. */
  createBackend: () => FhirBackend | Promise<FhirBackend>;
  /** Increase this only for a remote sandbox with known slow writes. */
  timeoutMs?: number;
};

/**
 * Defines the minimum behavioral contract every production backend adapter
 * must satisfy. It creates a uniquely-tagged synthetic Patient and Observation,
 * verifies the four FhirBackend methods against the server, then deletes both.
 *
 * Call this from an opt-in integration test. Never run it against a production
 * project: it intentionally creates and deletes synthetic resources.
 */
export function defineFhirBackendContract({
  name,
  createBackend,
  timeoutMs = 30_000,
}: FhirBackendContractOptions): void {
  describe(`${name} FhirBackend contract`, () => {
    const runId = randomUUID();
    const identifier = `${CONTRACT_SYSTEM}|${runId}`;
    const tag = { system: CONTRACT_SYSTEM, code: `run-${runId}` };
    let backend: FhirBackend;
    let patient: Patient & { id: string };
    let observationId: string | undefined;

    beforeAll(async () => {
      backend = await createBackend();
      patient = await backend.createResource<Patient>({
        resourceType: "Patient",
        identifier: [{ system: CONTRACT_SYSTEM, value: runId }],
        name: [{ family: "Adapter contract", given: ["LastEHR"] }],
        meta: { tag: [tag] },
      });
    }, timeoutMs);

    afterAll(async () => {
      const cleanup = await Promise.allSettled([
        ...(observationId
          ? [backend.deleteResource("Observation", observationId)]
          : []),
        ...(patient?.id ? [backend.deleteResource("Patient", patient.id)] : []),
      ]);
      const failures = cleanup.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failures.length > 0) {
        throw new Error(
          `Could not clean up ${name} contract resources: ${failures
            .map((failure) => String(failure.reason))
            .join("; ")}`,
        );
      }
    }, timeoutMs);

    it("searches a Patient with structured parameters", async () => {
      const bundle = await backend.search("Patient", {
        identifier,
        _count: "1",
      });

      expect(
        bundle.entry?.some((entry) => entry.resource?.id === patient.id),
      ).toBe(true);
    }, timeoutMs);

    it("reads a known Patient through searchResources and _id", async () => {
      const patients = await backend.searchResources("Patient", {
        _id: patient.id,
        _count: "1",
      });

      expect(patients.map((resource) => resource.id)).toContain(patient.id);
    }, timeoutMs);

    it("creates an Observation and preserves its meta.tag", async () => {
      const observation = await backend.createResource<Observation>({
        resourceType: "Observation",
        status: "final",
        code: { text: "Adapter contract observation" },
        subject: { reference: `Patient/${patient.id}` },
        valueQuantity: {
          value: 1,
          unit: "test",
          system: "http://unitsofmeasure.org",
          code: "1",
        },
        meta: { tag: [tag] },
      });
      observationId = observation.id;

      const persisted = await backend.searchResources("Observation", {
        _id: observation.id,
        _count: "1",
      });
      expect(persisted).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: observation.id,
            meta: expect.objectContaining({
              tag: expect.arrayContaining([tag]),
            }),
          }),
        ]),
      );
    }, timeoutMs);

    it("deletes the contract Observation", async () => {
      if (!observationId) {
        throw new Error("The contract Observation was not created.");
      }
      const id = observationId;
      await backend.deleteResource("Observation", id);
      observationId = undefined;

      const remaining = await backend.searchResources("Observation", {
        _id: id,
        _count: "1",
      });
      expect(remaining.map((resource) => resource.id)).not.toContain(id);
    }, timeoutMs);
  });
}
