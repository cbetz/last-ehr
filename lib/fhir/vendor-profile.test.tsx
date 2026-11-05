import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConfirmWrite } from "@/components/chat/confirm-write";
import type { Observation } from "@medplum/fhirtypes";

import {
  applyVendorProfile as mcpApply,
  EPIC_FLOWSHEET_MAPPINGS as mcpMappings,
  ORACLE_VITAL_ALLOWLIST as mcpAllowlist,
} from "../../packages/mcp/src/sandbox-profile";
import {
  applyVendorProfile,
  buildObservationApproval,
  EPIC_FLOWSHEET_MAPPINGS,
  EPIC_FLOWSHEET_SYSTEM,
  EPIC_VENDOR_PROFILE,
  ORACLE_VITAL_ALLOWLIST,
  ORACLE_VENDOR_PROFILE,
  publicVendorWriteContext,
  VendorWriteError,
} from "./vendor-profile";

const epicCreate = JSON.parse(
  readFileSync("lib/fhir/fixtures/epic-observation-create.json", "utf8"),
) as Observation;
const oracleCreate = JSON.parse(
  readFileSync("lib/fhir/fixtures/oracle-observation-create.json", "utf8"),
) as Observation;

describe("Epic vendor profile", () => {
  it("keeps a recorded successful pulse body stable", () => {
    expect(applyVendorProfile(EPIC_VENDOR_PROFILE, epicCreate)).toEqual(epicCreate);
    expect(mcpMappings).toEqual(EPIC_FLOWSHEET_MAPPINGS);
    expect(mcpAllowlist).toEqual(ORACLE_VITAL_ALLOWLIST);
    expect(mcpApply(EPIC_VENDOR_PROFILE, epicCreate)).toEqual(epicCreate);
  });

  it("adds flowsheet code 8 beside LOINC 8867-4 and requires an encounter", () => {
    const draft: Observation = {
      resourceType: "Observation",
      status: "final",
      category: epicCreate.category,
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "8867-4",
            display: "Heart rate",
          },
        ],
        text: "Heart rate",
      },
      subject: epicCreate.subject,
      effectiveDateTime: epicCreate.effectiveDateTime,
      valueQuantity: epicCreate.valueQuantity,
    };
    expect(() => applyVendorProfile(EPIC_VENDOR_PROFILE, draft)).toThrow(
      VendorWriteError,
    );
    expect(() => applyVendorProfile(EPIC_VENDOR_PROFILE, draft)).toThrow(
      /Encounter/,
    );
    const shaped = applyVendorProfile(EPIC_VENDOR_PROFILE, draft, {
      encounter: "eMT95RPaM-HxLc3NeIA5qlQ3",
    });
    expect(shaped.code?.coding?.[0]).toEqual({
      system: EPIC_FLOWSHEET_SYSTEM,
      code: "8",
      display: "Pulse",
    });
    expect(shaped.code?.coding?.[1]?.code).toBe("8867-4");
    expect(shaped.encounter?.reference).toBe(
      "Encounter/eMT95RPaM-HxLc3NeIA5qlQ3",
    );
  });

  it("refuses an unmapped LOINC instead of sending it", () => {
    const draft: Observation = {
      ...epicCreate,
      code: {
        coding: [{ system: "http://loinc.org", code: "8310-5", display: "Body temperature" }],
        text: "Body temperature",
      },
    };
    expect(() => applyVendorProfile(EPIC_VENDOR_PROFILE, draft)).toThrow(
      /8310-5/,
    );
  });
});

describe("Oracle vendor profile", () => {
  it("keeps the recorded oral-temperature body, including the LA performer", () => {
    expect(applyVendorProfile(ORACLE_VENDOR_PROFILE, oracleCreate)).toEqual(
      oracleCreate,
    );
  });

  it("refuses LOINC 8867-4 with the sandbox 422 and accepts 8331-1", () => {
    const heart: Observation = {
      resourceType: "Observation",
      status: "final",
      code: {
        coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }],
        text: "Heart rate",
      },
      subject: { reference: "Patient/12724066" },
      valueQuantity: { value: 72, unit: "/min" },
    };
    expect(() =>
      applyVendorProfile(ORACLE_VENDOR_PROFILE, heart, {
        performer: "Practitioner/12724064",
      }),
    ).toThrow(/422/);
    expect(() =>
      applyVendorProfile(ORACLE_VENDOR_PROFILE, heart, {
        performer: "Practitioner/12724064",
      }),
    ).toThrow(/8867-4/);

    const oral: Observation = {
      ...heart,
      code: {
        coding: [{ system: "http://loinc.org", code: "8331-1" }],
        text: "Temperature Oral",
      },
      valueQuantity: oracleCreate.valueQuantity,
    };
    expect(() => applyVendorProfile(ORACLE_VENDOR_PROFILE, oral)).toThrow(
      /Practitioner/,
    );
    const shaped = applyVendorProfile(ORACLE_VENDOR_PROFILE, oral, {
      performer: "12724064",
    });
    expect(shaped.performer?.[0]?.reference).toBe("Practitioner/12724064");
    expect(shaped.performer?.[0]?.extension?.[0]?.valueCodeableConcept?.coding?.[0]?.code).toBe(
      "LA",
    );
    expect(shaped.code?.coding?.[0]?.code).toBe("8331-1");
  });

  it("accepts an extra allowlist row without editing the function", () => {
    const draft: Observation = {
      resourceType: "Observation",
      status: "final",
      code: {
        coding: [{ system: "http://loinc.org", code: "29463-7", display: "Body weight" }],
      },
      subject: { reference: "Patient/12724066" },
    };
    const shaped = applyVendorProfile(ORACLE_VENDOR_PROFILE, draft, {
      performer: "Practitioner/12724064",
      allowlist: [{ loinc: "29463-7", display: "Body weight" }],
    });
    expect(shaped.code?.coding?.[0]?.code).toBe("29463-7");
  });
});

describe("approval card", () => {
  it("shows the Epic flowsheet write and blocks approval when the encounter is missing", () => {
    const ready = buildObservationApproval({
      patientId: "erXuFYUfucBZaryVksYEcMg3",
      label: "Heart rate",
      value: 72,
      unit: "bpm",
      vendor: {
        profile: EPIC_VENDOR_PROFILE,
        encounter: "Encounter/eMT95RPaM-HxLc3NeIA5qlQ3",
      },
    });
    expect(ready.blocked).toBeUndefined();
    const html = renderToStaticMarkup(
      <ConfirmWrite
        title="Record this observation?"
        resourceType="Observation"
        fields={ready.fields}
        preview={ready.preview}
        onApprove={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("Epic flowsheet 8");
    expect(html).toContain("8867-4");
    expect(html).toContain(EPIC_FLOWSHEET_SYSTEM);
    expect(html).toContain("Encounter/eMT95RPaM-HxLc3NeIA5qlQ3");
    expect(html).toContain("Approve");

    const blocked = buildObservationApproval({
      patientId: "erXuFYUfucBZaryVksYEcMg3",
      label: "Heart rate",
      value: 72,
      unit: "bpm",
      vendor: { profile: EPIC_VENDOR_PROFILE },
    });
    const blockedHtml = renderToStaticMarkup(
      <ConfirmWrite
        title="Record this observation?"
        resourceType="Observation"
        fields={blocked.fields}
        preview={blocked.preview}
        blocked={blocked.blocked}
        onApprove={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(blockedHtml).toContain("Epic requires an Encounter");
    expect(blockedHtml).not.toContain("Approve");
    expect(blockedHtml).toContain("Cancel");
  });

  it("shows the Oracle legal-authenticator performer for an oral temperature", () => {
    const approval = buildObservationApproval({
      patientId: "12724066",
      label: "oral temperature",
      value: 37,
      unit: "Cel",
      encounter: "Encounter/97954294",
      vendor: {
        profile: ORACLE_VENDOR_PROFILE,
        performer: "Practitioner/12724064",
      },
    });
    expect(approval.blocked).toBeUndefined();
    const preview = approval.preview as Observation;
    expect(preview.code?.coding?.[0]?.code).toBe("8331-1");
    expect(preview.performer?.[0]?.extension?.[0]?.valueCodeableConcept?.coding?.[0]?.code).toBe(
      "LA",
    );
    expect(approval.fields.some((field) => field.value.includes("12724064"))).toBe(
      true,
    );
  });
});

describe("public vendor context", () => {
  it("stays empty unless the flag and a complete SMART config are both set", () => {
    expect(publicVendorWriteContext({ FHIR_BACKEND: "epic" })).toBeNull();
    expect(
      publicVendorWriteContext({
        LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
        FHIR_BACKEND: "epic",
        LASTEHR_CLIENT_ID: "client",
      }),
    ).toBeNull();
    const epic = publicVendorWriteContext({
      LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
      FHIR_BACKEND: "epic",
      EPIC_ACCESS_TOKEN: "not-logged",
      LASTEHR_ENCOUNTER: "Encounter/e1",
    });
    expect(epic?.profile.id).toBe("epic");
    expect(JSON.stringify(epic)).not.toContain("not-logged");
    expect(
      publicVendorWriteContext({
        LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
        FHIR_BACKEND: "oracle-health",
        LASTEHR_CLIENT_ID: "client",
        LASTEHR_PRIVATE_KEY_PATH: "/tmp/key.pem",
        LASTEHR_SCOPES: "system/Observation.write",
        LASTEHR_PERFORMER: "Practitioner/12724064",
      })?.performer,
    ).toBe("Practitioner/12724064");
  });
});
