import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { Observation } from "@medplum/fhirtypes";

import { diffSentVsPersisted } from "./read-back";
import { EPIC_VENDOR_PROFILE, ORACLE_VENDOR_PROFILE } from "./vendor-profile";

const epicSent = JSON.parse(
  readFileSync("lib/fhir/fixtures/epic-observation-create.json", "utf8"),
) as Observation;
const epicRead = JSON.parse(
  readFileSync("lib/fhir/fixtures/epic-observation-read.json", "utf8"),
) as Observation;
const oracleSent = JSON.parse(
  readFileSync("lib/fhir/fixtures/oracle-observation-create.json", "utf8"),
) as Observation;

describe("read-back diff", () => {
  it("matches the recorded Epic pulse read-back and lists server-added codings", () => {
    const report = diffSentVsPersisted(
      epicSent,
      epicRead,
      EPIC_VENDOR_PROFILE.readBack,
    );
    expect(report.matched).toBe(true);
    expect(report.diff).toContain(`Read-back Observation/${epicRead.id}`);
    expect(report.diff).toContain("Matches the approved write.");
    expect(report.diff).toContain("8716-3");
    expect(report.diff).not.toContain("Lopez");
  });

  it("tolerates Oracle's added codings and the degree-F translation extension", () => {
    // Reconstructed from the 2026-11-04 log note: the GET body was not
    // captured, but it added Millennium codeSet/72 code 703558, LOINC
    // 8310-5, and a degF translation extension on top of the posted body.
    const persisted: Observation = {
      ...oracleSent,
      id: "VS-209196396",
      code: {
        ...oracleSent.code,
        coding: [
          ...(oracleSent.code?.coding ?? []),
          {
            system:
              "https://fhir.cerner.com/ec2458f2-1e24-41c8-b71b-0e701af7583d/codeSet/72",
            code: "703558",
          },
          { system: "http://loinc.org", code: "8310-5", display: "Body temperature" },
        ],
      },
      valueQuantity: {
        ...oracleSent.valueQuantity,
        extension: [
          {
            url: "http://hl7.org/fhir/StructureDefinition/iso21090-PQ-translation",
            valueQuantity: {
              value: 98.6,
              unit: "degF",
              system: "http://unitsofmeasure.org",
              code: "[degF]",
            },
          },
        ],
      },
    };
    const report = diffSentVsPersisted(
      oracleSent,
      persisted,
      ORACLE_VENDOR_PROFILE.readBack,
    );
    expect(report.matched).toBe(true);
    expect(report.diff).toContain("703558");
    expect(report.diff).toContain("8310-5");
    expect(report.diff).toContain("valueQuantity extension ignored");
    expect(report.diff).toContain("iso21090-PQ-translation");
  });

  it("reports a changed value as a mismatch without dumping the resource", () => {
    const persisted: Observation = {
      ...oracleSent,
      id: "VS-209196396",
      valueQuantity: { ...oracleSent.valueQuantity, value: 40 },
    };
    const report = diffSentVsPersisted(
      oracleSent,
      persisted,
      ORACLE_VENDOR_PROFILE.readBack,
    );
    expect(report.matched).toBe(false);
    expect(report.diff).toContain("valueQuantity.value");
    expect(report.diff).toContain("40");
    expect(report.diff).not.toContain("legal authenticator");
  });
});
