import { describe, expect, it } from "vitest";

import { buildTools } from "@/lib/ai/tools";
import { HapiBackend } from "@/lib/fhir/hapi";

// The false negative this pins is a property of real seeded data, not of a
// fake: the repository's synthetic immunizations and medications carry
// text-only CodeableConcepts on purpose (asserting unverified CVX/RxNorm codes
// would be worse), so a coded search parameter cannot match them. A unit test
// with a hand-built fake would prove the code path; only the real stack proves
// the data actually has this shape.
const runHapiE2E = process.env.RUN_HAPI_E2E === "1";

if (!runHapiE2E) {
  describe.skip("coded reads against HAPI", () => {});
} else {
  const baseUrl = process.env.FHIR_BASE_URL;
  if (!baseUrl) {
    throw new Error("FHIR_BASE_URL is required for the coded-read test.");
  }

  type ChartRead = {
    entries: { id: string; text: string; date: string }[];
    truncated: boolean;
    codeFilterUnmatched?: boolean;
  };

  describe("coded reads against HAPI", () => {
    const backend = new HapiBackend(baseUrl);
    const tools = buildTools(backend);
    const read = (input: Record<string, unknown>) =>
      (
        tools.read_chart_section.execute as unknown as (
          i: unknown,
          o: unknown,
        ) => Promise<ChartRead>
      )(input, {});

    // By name, not the first row: a shared evaluation stack also holds
    // contract-test patients that carry no clinical data, and picking one of
    // those would make these assertions pass for the wrong reason.
    const patientId = async () => {
      const rows = await backend.searchResources("Patient", {
        family: "Garcia",
        _count: "5",
      });
      const patient = rows.find((row) => row.id);
      if (!patient?.id) {
        throw new Error("Seed the HAPI stack first (npm run seed).");
      }
      return patient.id;
    };

    it("does not report text-only immunizations as absent when a code misses", async () => {
      const patient = await patientId();

      const coded = await read({
        patientId: patient,
        resourceType: "Immunization",
        code: "88", // CVX, influenza — the seed carries no coding at all
      });
      expect(coded.entries).toEqual([]);
      // The server matched nothing, so the window was never full: truncated is
      // correctly false and cannot carry this.
      expect(coded.truncated).toBe(false);
      expect(coded.codeFilterUnmatched).toBe(true);

      // ...and the records the model must not deny are right there.
      const bare = await read({
        patientId: patient,
        resourceType: "Immunization",
      });
      expect(bare.entries.length).toBeGreaterThan(0);
      expect(bare.codeFilterUnmatched).toBeUndefined();
    });

    it("stays quiet when the section is genuinely empty for the filter", async () => {
      const coded = await read({
        patientId: await patientId(),
        resourceType: "Immunization",
        code: "88",
        dateFrom: "1901-01-01",
        dateTo: "1901-12-31",
      });
      expect(coded.entries).toEqual([]);
      // No immunizations exist in that window at all, coded or not, so there
      // is nothing the model would be wrong to call absent.
      expect(coded.codeFilterUnmatched).toBeUndefined();
    });

    it("resolves a measurement name to codes that actually match seeded rows", async () => {
      // The point of resolution: a name the model can say, mapped to a code it
      // would otherwise have to recall. If the mapping were wrong this comes
      // back empty, which is exactly the false negative it prevents.
      const patient = await patientId();

      const byName = await read({
        patientId: patient,
        resourceType: "Observation",
        measurement: "blood pressure",
      });
      expect(byName.entries.length).toBeGreaterThan(0);

      // "blood pressure" must be BOTH codes: the union has to exceed either
      // half, or the read silently answered half the question.
      const systolic = await read({
        patientId: patient,
        resourceType: "Observation",
        measurement: "systolic blood pressure",
      });
      expect(systolic.entries.length).toBeGreaterThan(0);
      expect(byName.entries.length).toBeGreaterThan(systolic.entries.length);

      // And a single vital resolves to the row the write path would create.
      const pulse = await read({
        patientId: patient,
        resourceType: "Observation",
        measurement: "pulse",
      });
      expect(pulse.entries.length).toBeGreaterThan(0);
    });

    it("stays quiet on a section whose seed data IS coded", async () => {
      // Observations carry real LOINC, so the coded filter works normally and
      // the extra existence probe never fires.
      const coded = await read({
        patientId: await patientId(),
        resourceType: "Observation",
        code: "8480-6", // systolic blood pressure
      });
      expect(coded.entries.length).toBeGreaterThan(0);
      expect(coded.codeFilterUnmatched).toBeUndefined();
    });
  });
}
