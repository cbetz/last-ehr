import { describe, expect, it } from "vitest";

import { SYNTHETIC_SYSTEM } from "../../../lib/fhir/synthetic";
import { patients } from "../../../scripts/fixtures/patients";
import {
  bindSubject,
  SUBJECT_REFERENCE,
  SYNTHETIC_IDENTIFIER_SYSTEM,
  syntheticChartResources,
} from "./synthetic-chart.js";
import { syntheticPatients } from "./synthetic-patients.js";

describe("synthetic chart fixtures", () => {
  it("keeps the packaged fixtures equal to scripts/fixtures/patients.ts", () => {
    expect(SYNTHETIC_IDENTIFIER_SYSTEM).toBe(SYNTHETIC_SYSTEM);
    expect(syntheticPatients).toEqual(patients);
  });

  it("builds the chart npm run seed writes, including an inline note and a URL-only attachment", () => {
    const john = patients.find((patient) => patient.key === "synthetic-001");
    expect(john).toBeDefined();
    const chart = syntheticChartResources(john!);
    expect(chart.patient.identifier).toEqual([
      { system: SYNTHETIC_SYSTEM, value: "synthetic-001" },
    ]);
    expect(chart.patient.name?.[0]).toMatchObject({ family: "Smith", given: ["John", "A"] });
    const condition = chart.related.find((resource) => resource.resourceType === "Condition");
    expect(condition).toMatchObject({
      code: { text: "Essential hypertension" },
      subject: { reference: SUBJECT_REFERENCE },
    });
    const documents = chart.related.filter(
      (resource) => resource.resourceType === "DocumentReference",
    );
    expect(documents).toHaveLength(2);
    const inline = documents[0];
    expect(inline).toMatchObject({
      content: [{ attachment: { contentType: "text/plain" } }],
    });
    const inlineData =
      inline && "content" in inline ? inline.content?.[0]?.attachment?.data : undefined;
    expect(Buffer.from(inlineData ?? "", "base64").toString("utf8")).toContain(
      "CARDIOLOGY CONSULTATION",
    );
    expect(documents[1]).toMatchObject({
      content: [{ attachment: { url: "Binary/synthetic-outside-records" } }],
    });
    expect(
      documents[1] && "content" in documents[1]
        ? documents[1].content?.[0]?.attachment?.data
        : undefined,
    ).toBeUndefined();

    const bound = bindSubject(chart.related[0]!, "patient-1");
    expect(JSON.stringify(bound)).toContain("Patient/patient-1");
    expect(JSON.stringify(bound)).not.toContain(SUBJECT_REFERENCE);
  });
});
