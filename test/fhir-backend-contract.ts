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
    const isolationObservationIds: string[] = [];

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
      // Sequential on purpose: concurrent deletes of resources referencing
      // the same Patient contend on some servers (HAPI answers HAPI-0826
      // version-constraint failures), and cleanup must be reliable on every
      // adapter target.
      const deletions: Array<{ type: "Observation" | "Patient"; id: string }> =
        [
          ...(observationId
            ? [{ type: "Observation" as const, id: observationId }]
            : []),
          ...isolationObservationIds.map((id) => ({
            type: "Observation" as const,
            id,
          })),
          ...(patient?.id
            ? [{ type: "Patient" as const, id: patient.id }]
            : []),
        ];
      const failures: string[] = [];
      for (const { type, id } of deletions) {
        try {
          await backend.deleteResource(type, id);
        } catch (error) {
          failures.push(String(error));
        }
      }
      if (failures.length > 0) {
        throw new Error(
          `Could not clean up ${name} contract resources: ${failures.join("; ")}`,
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

    it("enforces the session-isolation search semantics (_tag and _tag:not)", async () => {
      // The demo's per-session write isolation queries the server with
      // exactly two shapes (searchVisible, lib/ai/tools.ts): rows tagged
      // with this session's code (_tag=system|code) and rows carrying no
      // tag in the demo system at all (_tag:not=system|). This clause is a
      // hard precondition for demo-picker eligibility (docs/support.md):
      //
      // - The positive _tag match is the safety keystone and must hold
      //   strictly — a server that matches the wrong rows here can leak one
      //   visitor's writes into another's chart, and no client-side filter
      //   runs on the own-tag query.
      // - The bare-system :not query may be honored (best: query-level
      //   filtering) or rejected loudly (e.g. HAPI-1218; the app falls back
      //   to an unfiltered query plus its client-side visibility filter).
      //   What must never happen is the composed visible set coming out
      //   wrong, so the second half mirrors the app's fallback exactly.
      const makeObservation = (
        code: string,
        tags?: { system: string; code: string }[],
      ) =>
        backend.createResource<Observation>({
          resourceType: "Observation",
          status: "final",
          code: { text: `Isolation contract ${code}` },
          subject: { reference: `Patient/${patient.id}` },
          valueQuantity: {
            value: 1,
            unit: "test",
            system: "http://unitsofmeasure.org",
            code: "1",
          },
          ...(tags ? { meta: { tag: tags } } : {}),
        });

      // Sequential for the same reason as the cleanup: concurrent writes
      // referencing one Patient can contend on some servers.
      const own = await makeObservation("own", [
        { system: CONTRACT_SYSTEM, code: `session-${runId}-own` },
      ]);
      const other = await makeObservation("other", [
        { system: CONTRACT_SYSTEM, code: `session-${runId}-other` },
      ]);
      const untagged = await makeObservation("untagged");
      isolationObservationIds.push(own.id, other.id, untagged.id);

      // Scoped to the contract patient so a shared sandbox's foreign rows
      // cannot influence the result.
      const subject = `Patient/${patient.id}`;

      const ownRows = await backend.searchResources("Observation", {
        subject,
        _tag: `${CONTRACT_SYSTEM}|session-${runId}-own`,
        _count: "50",
      });
      const ownIds = ownRows.map((resource) => resource.id);
      expect(ownIds).toContain(own.id);
      expect(ownIds).not.toContain(other.id);
      expect(ownIds).not.toContain(untagged.id);

      // The untagged-set query, with the app's exact fallback: servers that
      // reject the bare-system token get the unfiltered query, and the
      // client-side filter (mirroring isVisible) drops rows tagged in the
      // system. The composed result must be right either way.
      const untaggedRows = await backend
        .searchResources("Observation", {
          subject,
          "_tag:not": `${CONTRACT_SYSTEM}|`,
          _count: "50",
        })
        .catch(() =>
          backend.searchResources("Observation", { subject, _count: "50" }),
        );
      const visibleUntagged = untaggedRows.filter(
        (resource) =>
          !(resource.meta?.tag ?? []).some(
            (entry) => entry.system === CONTRACT_SYSTEM,
          ),
      );
      const untaggedIds = visibleUntagged.map((resource) => resource.id);
      expect(untaggedIds).toContain(untagged.id);
      expect(untaggedIds).not.toContain(own.id);
      expect(untaggedIds).not.toContain(other.id);
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
