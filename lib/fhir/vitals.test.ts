import { describe, expect, it } from "vitest";

import {
  codeObservation,
  observationConceptNames,
  resolveObservationConcept,
  resolveUcumCode,
  resolveVitalCoding,
  UCUM_SYSTEM,
} from "@/lib/fhir/vitals";
import { codeObservation as mcpCodeObservation } from "../../packages/mcp/src/vitals";

describe("observation coding", () => {
  it("codes a recognized vital with LOINC and the vital-signs category", () => {
    const coded = codeObservation("Heart rate", "bpm");
    expect(coded.code.coding).toEqual([
      { system: "http://loinc.org", code: "8867-4", display: "Heart rate" },
    ]);
    // The human's own words stay the display text even when coded.
    expect(coded.code.text).toBe("Heart rate");
    expect(coded.category?.[0].coding[0].code).toBe("vital-signs");
    // "bpm" is NOT a UCUM code; "/min" is. This is the untruth the table fixes.
    expect(coded.ucum).toBe("/min");
  });

  it("never claims a typed unit string is a UCUM code", () => {
    for (const unit of ["bpm", "beats/min", "mmHg", "lbs", "°C"]) {
      const ucum = resolveUcumCode(unit);
      expect(ucum).toBeDefined();
      expect(ucum).not.toBe(unit);
    }
    // An unrecognized unit yields nothing, so the caller omits system/code
    // rather than asserting a code it does not have.
    expect(resolveUcumCode("widgets per fortnight")).toBeUndefined();
    expect(codeObservation("Heart rate", "widgets per fortnight").ucum).toBeUndefined();
  });

  it("degrades to plain text with NO category for an unrecognized label", () => {
    const coded = codeObservation("Peak expiratory flow", "L/min");
    expect(coded.code.coding).toBeUndefined();
    expect(coded.code.text).toBe("Peak expiratory flow");
    // Guessing vital-signs for an unknown measurement would be a
    // classification the tool cannot justify.
    expect(coded.category).toBeUndefined();
  });

  it("resolves the same measurement in different units independently of the label", () => {
    expect(codeObservation("Body temperature", "C").ucum).toBe("Cel");
    expect(codeObservation("Body temperature", "F").ucum).toBe("[degF]");
    // Same LOINC either way.
    expect(codeObservation("Body temperature", "F").code.coding?.[0].code).toBe(
      "8310-5",
    );
  });

  it("matches labels case-insensitively and by common shorthand", () => {
    expect(resolveVitalCoding("PULSE")?.loinc).toBe("8867-4");
    expect(resolveVitalCoding("spo2")?.loinc).toBe("59408-5");
    expect(resolveVitalCoding("  weight  ")?.loinc).toBe("29463-7");
    expect(resolveVitalCoding("unknown thing")).toBeUndefined();
  });

  it("exposes the UCUM system constant the write path uses", () => {
    expect(UCUM_SYSTEM).toBe("http://unitsofmeasure.org");
  });

  it("resolves a read concept to the code set that answers it", () => {
    // A write codes one measurement; a read has to answer a question, and
    // "blood pressure" is two codes. One of them alone answers half.
    expect(resolveObservationConcept("blood pressure")?.loinc).toEqual([
      "8480-6",
      "8462-4",
    ]);
    expect(resolveObservationConcept("bp")?.loinc).toEqual(["8480-6", "8462-4"]);
    // Single vitals come straight from the write-path table, synonyms included.
    expect(resolveObservationConcept("pulse")?.loinc).toEqual(["8867-4"]);
    expect(resolveObservationConcept("temp")?.loinc).toEqual(["8310-5"]);
    expect(resolveObservationConcept("hemoglobin a1c")).toBeUndefined();
  });

  it("resolves a read and a write of the same label to the same code", () => {
    // If these diverged the agent would write a row its own read cannot find.
    for (const label of [
      "heart rate", "pulse", "temp", "weight", "height",
      "systolic", "diastolic", "spo2", "bmi", "head circumference",
    ]) {
      const read = resolveObservationConcept(label);
      const write = resolveVitalCoding(label);
      expect(read?.loinc, `read/write disagree on "${label}"`).toEqual([
        write?.loinc,
      ]);
    }
  });

  it("names every measurement it accepts, so a refusal is actionable", () => {
    const names = observationConceptNames();
    expect(names).toContain("heart rate");
    expect(names).toContain("blood pressure");
    // Sorted and unique: the list goes into an error message the model reads.
    expect(names).toEqual([...new Set(names)].sort());
  });

  it("stays byte-for-byte in behavior with the @lastehr/mcp copy", () => {
    // The MCP package publishes standalone and cannot import from the app,
    // so its vitals table is a copy. This is the drift guard: if either
    // side changes, the two bindings would code the same write differently.
    const labels = [
      "Heart rate", "pulse", "Body temperature", "Body weight", "height",
      "Systolic blood pressure", "diastolic", "spo2", "BMI",
      "head circumference", "Peak expiratory flow", "",
    ];
    const units = ["bpm", "/min", "mmHg", "C", "F", "kg", "lbs", "cm", "in", "%", "kg/m2", "nonsense"];
    for (const label of labels) {
      for (const unit of units) {
        expect(mcpCodeObservation(label, unit)).toEqual(
          codeObservation(label, unit),
        );
      }
    }
  });
});
