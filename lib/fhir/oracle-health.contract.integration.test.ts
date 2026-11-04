import { describe, expect, it } from "vitest";

import { OracleHealthBackend, ORACLE_HEALTH_OPEN_SANDBOX_BASE_URL } from "./oracle-health";

/**
 * Opt-in read-only conformance against Oracle's public open sandbox.
 * It does not create or delete charts. The shared FhirBackend contract
 * cannot run here: that harness writes.
 *
 *   RUN_ORACLE_HEALTH_E2E=1 npx vitest run lib/fhir/oracle-health.contract.integration.test.ts
 *
 * Patient/12742400 is the example id in Oracle's service-root documentation.
 * Nothing in this file prints a resource body.
 */
const run = process.env.RUN_ORACLE_HEALTH_E2E === "1";
const DOCUMENTED_PATIENT_ID = "12742400";

if (!run) {
  describe.skip("Oracle Health open sandbox conformance", () => {});
} else {
  const backend = new OracleHealthBackend();

  describe("Oracle Health open sandbox conformance", () => {
    it("serves an R4 CapabilityStatement with no write interactions on the tool resources", async () => {
      const response = await fetch(
        `${ORACLE_HEALTH_OPEN_SANDBOX_BASE_URL}/metadata`,
        {
          headers: { accept: "application/fhir+json" },
          signal: AbortSignal.timeout(30_000),
        },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        resourceType?: string;
        fhirVersion?: string;
        rest?: Array<{
          resource?: Array<{
            type?: string;
            interaction?: Array<{ code?: string }>;
          }>;
        }>;
      };
      expect(body.resourceType).toBe("CapabilityStatement");
      expect(body.fhirVersion).toBe("4.0.1");
      const resources = body.rest?.[0]?.resource ?? [];
      const byType = new Map(resources.map((resource) => [resource.type, resource]));
      for (const type of ["Patient", "Observation", "Communication"]) {
        const codes = (byType.get(type)?.interaction ?? []).map(
          (interaction) => interaction.code,
        );
        expect(codes).toEqual(expect.arrayContaining(["read", "search-type"]));
        expect(codes).not.toContain("create");
        expect(codes).not.toContain("update");
        expect(codes).not.toContain("delete");
      }
      expect(byType.has("Task")).toBe(false);
    }, 60_000);

    it("reads the documented synthetic patient through _id search, including the tool's _count", async () => {
      const patients = await backend.searchResources("Patient", {
        _id: DOCUMENTED_PATIENT_ID,
        _count: "1",
      });
      expect(patients.map((patient) => patient.id)).toContain(
        DOCUMENTED_PATIENT_ID,
      );
    }, 60_000);

    it("accepts a name search that matches nothing", async () => {
      const bundle = await backend.search("Patient", {
        name: "NoSuchLastEhrProbeZz",
        _count: "1",
      });
      expect(bundle.resourceType).toBe("Bundle");
      expect(bundle.type).toBe("searchset");
    }, 60_000);

    it("returns an Observation searchset for the documented patient", async () => {
      const bundle = await backend.search("Observation", {
        patient: DOCUMENTED_PATIENT_ID,
        _count: "1",
      });
      expect(bundle.resourceType).toBe("Bundle");
      expect(bundle.type).toBe("searchset");
    }, 60_000);

    it("still returns the patient when an unknown _tag is added", async () => {
      const patients = await backend.searchResources("Patient", {
        _id: DOCUMENTED_PATIENT_ID,
        _tag: "https://lastehr.com/adapter-contract|no-such-tag",
      });
      expect(patients.map((patient) => patient.id)).toContain(
        DOCUMENTED_PATIENT_ID,
      );
    }, 60_000);

    it("refuses a Communication search the chart reader would send", async () => {
      await expect(
        backend.search("Communication", {
          subject: `Patient/${DOCUMENTED_PATIENT_ID}`,
          _count: "1",
        }),
      ).rejects.toThrow(/FHIR request failed/);
    }, 60_000);

    it("does not write, and the server refuses a POST", async () => {
      await expect(
        backend.createResource({
          resourceType: "Observation",
          status: "final",
          code: { text: "Last EHR read-only probe" },
        }),
      ).rejects.toMatchObject({ code: "FHIR_DRY_RUN" });

      const response = await fetch(
        `${ORACLE_HEALTH_OPEN_SANDBOX_BASE_URL}/Observation`,
        {
          method: "POST",
          headers: {
            accept: "application/fhir+json",
            "content-type": "application/fhir+json",
          },
          body: JSON.stringify({
            resourceType: "Observation",
            status: "final",
            code: { text: "Last EHR read-only probe" },
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    }, 60_000);
  });
}
