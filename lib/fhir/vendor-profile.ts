import type { Observation, Resource } from "@medplum/fhirtypes";

import { assessSmartAuth, sandboxFlagOn, type SmartAuthEnv } from "./smart-config";
import { codeObservation, LOINC_SYSTEM, resolveUcumCode, UCUM_SYSTEM } from "./vitals";

/**
 * Vendor write profiles run before the human approves, so the card shows
 * a body the sandbox has actually accepted. They are not a clinical
 * correctness check. The tables below are the extension point: add a row
 * after a sandbox create of that code succeeds.
 */

export const EPIC_FLOWSHEET_SYSTEM =
  "urn:oid:1.2.840.114350.1.13.0.1.7.2.707679";

export type EpicFlowsheetMapping = {
  loinc: string;
  /** Code in EPIC_FLOWSHEET_SYSTEM. Pulse is "8". */
  flowsheetCode: string;
  display: string;
};

/** Proven 2026-11-04: LOINC 8867-4 alone returned HTTP 400 (multiple rows). */
export const EPIC_FLOWSHEET_MAPPINGS: readonly EpicFlowsheetMapping[] = [
  { loinc: "8867-4", flowsheetCode: "8", display: "Pulse" },
];

export type OracleVitalAllowance = {
  loinc: string;
  display: string;
};

/** Proven 2026-11-04 on the fhir-ehr-code sandbox. */
export const ORACLE_VITAL_ALLOWLIST: readonly OracleVitalAllowance[] = [
  { loinc: "8331-1", display: "Temperature Oral" },
];

export const ORACLE_VITAL_REJECTIONS: readonly {
  loinc: string;
  message: string;
}[] = [
  {
    loinc: "8867-4",
    message:
      "Oracle Health sandbox returned HTTP 422 for LOINC 8867-4 (heart rate). That code is not on the allowlist. LOINC 8331-1 (oral temperature) is accepted. Extend ORACLE_VITAL_ALLOWLIST only after a sandbox create of that code succeeds.",
  },
];

export const PERFORMER_FUNCTION_URL =
  "http://hl7.org/fhir/StructureDefinition/event-performerFunction";
export const PARTICIPATION_TYPE_SYSTEM =
  "http://terminology.hl7.org/CodeSystem/v3-ParticipationType";

export type VendorReadBackTolerance = {
  /** Server-added codings are listed and do not fail the match. */
  ignoreAddedCodings: boolean;
  /** valueQuantity translation extensions are listed and do not fail the match. */
  ignoreValueQuantityExtensions: boolean;
};

export type VendorProfile = {
  id: "epic" | "oracle";
  readBack: VendorReadBackTolerance;
};

export const EPIC_VENDOR_PROFILE: VendorProfile = {
  id: "epic",
  readBack: {
    ignoreAddedCodings: true,
    ignoreValueQuantityExtensions: false,
  },
};

export const ORACLE_VENDOR_PROFILE: VendorProfile = {
  id: "oracle",
  readBack: {
    ignoreAddedCodings: true,
    ignoreValueQuantityExtensions: true,
  },
};

export type VendorWriteContext = {
  profile: VendorProfile;
  encounter?: string;
  performer?: string;
};

export type VendorWriteHints = {
  encounter?: string;
  performer?: string;
  mappings?: readonly EpicFlowsheetMapping[];
  allowlist?: readonly OracleVitalAllowance[];
  /**
   * Oracle's proven Observation create has no meta.tag. The tag is omitted
   * unless this is set. LASTEHR_INCLUDE_META_TAG=1 turns it back on.
   */
  includeMetaTag?: boolean;
};

export class VendorWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VendorWriteError";
  }
}

const OBSERVATION_ONLY =
  "This sandbox adapter sends Observation creates only. Notes, tasks, and superseding observations are not a proven write on this server, so nothing will be saved.";

export function vendorBlocksTool(
  profile: VendorProfile | undefined,
  tool: "record_observation" | "other",
): string | undefined {
  if (!profile || tool === "record_observation") return undefined;
  return OBSERVATION_ONLY;
}

const ID_RE = /^[A-Za-z0-9\-.]{1,128}$/;

export function fhirReference(
  kind: "Encounter" | "Practitioner",
  value: string | undefined,
): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  const prefix = `${kind}/`;
  if (trimmed.startsWith(prefix)) {
    const id = trimmed.slice(prefix.length);
    if (!ID_RE.test(id)) {
      throw new VendorWriteError(
        `${kind} reference must be ${kind}/{id} with a FHIR-style id.`,
      );
    }
    return `${kind}/${id}`;
  }
  if (trimmed.includes("/")) {
    throw new VendorWriteError(`${kind} reference must be ${kind}/{id}.`);
  }
  if (!ID_RE.test(trimmed)) {
    throw new VendorWriteError(
      `${kind} id must be a FHIR-style id (letters, numbers, ".", "-").`,
    );
  }
  return `${kind}/${trimmed}`;
}

type Coding = { system?: string; code?: string; display?: string };

function codingsOf(resource: Observation): Coding[] {
  return resource.code?.coding ?? [];
}

function loincCodes(resource: Observation): string[] {
  return codingsOf(resource)
    .filter((coding) => coding.system === LOINC_SYSTEM && coding.code)
    .map((coding) => coding.code as string);
}

function cloneObservation(resource: Observation): Observation {
  return JSON.parse(JSON.stringify(resource)) as Observation;
}

type Quantity = NonNullable<Observation["valueQuantity"]>;

/**
 * Epic rejected Quantity.unit "bpm" when code was the UCUM "/min"
 * (OperationOutcome 59102: unit expected "/min"). The accepted Epic body
 * puts that UCUM code in unit. The accepted Oracle body uses display unit
 * "degC" with code "Cel", so Celsius is not rewritten to the UCUM code.
 */
function alignSandboxQuantity(quantity: Quantity, vendor: "epic" | "oracle"): Quantity {
  const coded =
    typeof quantity.code === "string" && quantity.code.trim()
      ? quantity.code
      : resolveUcumCode(quantity.unit ?? "");
  if (!coded) return quantity;
  if (vendor === "oracle" && coded === "Cel") {
    return { ...quantity, unit: "degC", system: UCUM_SYSTEM, code: "Cel" };
  }
  if (vendor === "epic") {
    return {
      ...quantity,
      unit: coded,
      system: quantity.system ?? UCUM_SYSTEM,
      code: coded,
    };
  }
  return quantity;
}

function omitMetaTag(resource: Observation): void {
  if (!resource.meta?.tag) return;
  const meta = { ...resource.meta };
  delete meta.tag;
  if (Object.keys(meta).length === 0) delete resource.meta;
  else resource.meta = meta;
}

function applyEpic(
  resource: Observation,
  hints: VendorWriteHints,
): Observation {
  const next = cloneObservation(resource);
  const encounter =
    next.encounter?.reference ??
    fhirReference("Encounter", hints.encounter);
  if (!encounter?.startsWith("Encounter/")) {
    throw new VendorWriteError(
      "Epic requires an Encounter reference on the observation. Pass encounter, or set LASTEHR_ENCOUNTER to a sandbox Encounter id. The approval card stays blocked until that reference is on the write.",
    );
  }
  if (!next.encounter?.reference) {
    next.encounter = { reference: encounter };
  }

  const loincs = loincCodes(next);
  if (loincs.length === 0) {
    throw new VendorWriteError(
      "Epic sandbox needs a mapped LOINC vital so a flowsheet code can be sent. This observation has no LOINC coding.",
    );
  }
  const mappings = hints.mappings ?? EPIC_FLOWSHEET_MAPPINGS;
  const mapping = mappings.find((row) => loincs.includes(row.loinc));
  if (!mapping) {
    throw new VendorWriteError(
      `Epic sandbox needs a flowsheet code for LOINC ${loincs.join(", ")}, and EPIC_FLOWSHEET_MAPPINGS has no row for it. Sending LOINC alone can match multiple flowsheet rows (the sandbox returned HTTP 400 for that). Add a row after you confirm the flowsheet code.`,
    );
  }
  const coding = next.code?.coding ?? [];
  const already = coding.some(
    (row) =>
      row.system === EPIC_FLOWSHEET_SYSTEM && row.code === mapping.flowsheetCode,
  );
  if (!already) {
    next.code = {
      ...next.code,
      text: next.code?.text ?? mapping.display,
      coding: [
        {
          system: EPIC_FLOWSHEET_SYSTEM,
          code: mapping.flowsheetCode,
          display: mapping.display,
        },
        ...coding,
      ],
    };
  }
  if (next.valueQuantity) {
    next.valueQuantity = alignSandboxQuantity(next.valueQuantity, "epic");
  }
  return next;
}

function legalAuthenticator(reference: string) {
  return {
    reference,
    extension: [
      {
        url: PERFORMER_FUNCTION_URL,
        valueCodeableConcept: {
          coding: [
            {
              system: PARTICIPATION_TYPE_SYSTEM,
              code: "LA",
              display: "legal authenticator",
            },
          ],
          text: "legal authenticator",
        },
      },
    ],
  };
}

function applyOracle(
  resource: Observation,
  hints: VendorWriteHints,
): Observation {
  const next = cloneObservation(resource);
  const loincs = loincCodes(next);
  for (const loinc of loincs) {
    const rejection = ORACLE_VITAL_REJECTIONS.find((row) => row.loinc === loinc);
    if (rejection) throw new VendorWriteError(rejection.message);
  }
  const allowlist = hints.allowlist ?? ORACLE_VITAL_ALLOWLIST;
  const allowed = allowlist.filter((row) => loincs.includes(row.loinc));
  if (allowed.length === 0) {
    const accepted = allowlist
      .map((row) => `${row.loinc} (${row.display})`)
      .join(", ");
    throw new VendorWriteError(
      loincs.length === 0
        ? `Oracle Health sandbox writes need an allowlisted LOINC code. This observation has none. Accepted codes: ${accepted}.`
        : `Oracle Health sandbox allowlist does not include LOINC ${loincs.join(", ")}. Accepted codes: ${accepted}. Extend ORACLE_VITAL_ALLOWLIST only after a sandbox create of that code succeeds.`,
    );
  }

  const hinted = fhirReference("Practitioner", hints.performer);
  const existing = next.performer?.[0]?.reference;
  if (existing && !existing.startsWith("Practitioner/")) {
    throw new VendorWriteError(
      "Oracle Health requires a Practitioner performer, not another resource type.",
    );
  }
  if (existing && hinted && existing !== hinted) {
    throw new VendorWriteError(
      "Oracle Health performer on the observation does not match the performer passed with the proposal.",
    );
  }
  const reference = existing ?? hinted;
  if (!reference) {
    throw new VendorWriteError(
      "Oracle Health requires a Practitioner performer with event-performerFunction code LA (legal authenticator). Pass performer, or set LASTEHR_PERFORMER.",
    );
  }
  next.performer = [legalAuthenticator(reference)];
  const encounter =
    next.encounter?.reference ?? fhirReference("Encounter", hints.encounter);
  if (encounter && !next.encounter?.reference) {
    next.encounter = { reference: encounter };
  }
  if (next.valueQuantity) {
    next.valueQuantity = alignSandboxQuantity(next.valueQuantity, "oracle");
  }
  if (!hints.includeMetaTag) omitMetaTag(next);
  return next;
}

/**
 * Shape a proposed resource into one the vendor sandbox accepted, or throw
 * VendorWriteError with a message safe to show the reviewer and the agent.
 * Pure: no network, no clock, no env reads. Callers pass encounter and
 * performer from the tool arguments or the deployment defaults.
 */
export function applyVendorProfile<T extends Resource>(
  profile: VendorProfile | undefined,
  resource: T,
  hints: VendorWriteHints = {},
): T {
  if (!profile) return resource;
  if (resource.resourceType !== "Observation") {
    throw new VendorWriteError(OBSERVATION_ONLY);
  }
  const shaped =
    profile.id === "epic"
      ? applyEpic(resource as Observation, hints)
      : applyOracle(resource as Observation, hints);
  return shaped as T;
}

export function vendorWritePrompt(
  vendor: VendorWriteContext | null,
): string | undefined {
  if (!vendor) return undefined;
  if (vendor.profile.id === "epic") {
    return [
      "Epic sandbox write profile: record_observation is the write this sandbox accepts. The approval card shows the body that will be posted, including an Epic flowsheet code plus the LOINC code.",
      "An Encounter reference is required. Pass encounter as an Encounter id, or omit it when a deployment default is set.",
      vendor.encounter
        ? `Deployment encounter: ${vendor.encounter}.`
        : "No deployment encounter is set; pass encounter or the card refuses the write.",
      "Notes, tasks, and unmapped LOINC vitals are refused before approval.",
      "This sandbox does not support delete. An approved observation stays on the sandbox.",
    ].join(" ");
  }
  return [
    "Oracle Health sandbox write profile: record_observation is the write this sandbox accepts. The performer must be a Practitioner with the legal-authenticator (LA) function. The card shows that extension.",
    vendor.performer
      ? `Deployment performer: ${vendor.performer}.`
      : "No deployment performer is set; pass performer or the card refuses the write.",
    "Only allowlisted vital codes are sent. LOINC 8331-1 (oral temperature) is accepted. LOINC 8867-4 was rejected by the sandbox with HTTP 422 and is refused here.",
    "This sandbox does not support delete. An approved observation stays on the sandbox.",
  ].join(" ");
}

export function publicVendorWriteContext(
  env: SmartAuthEnv = process.env,
): VendorWriteContext | null {
  if (!sandboxFlagOn(env)) return null;
  const backend = env.FHIR_BACKEND?.trim();
  const encounter = env.LASTEHR_ENCOUNTER?.trim() || undefined;
  const performer = env.LASTEHR_PERFORMER?.trim() || undefined;
  if (backend === "epic" && assessSmartAuth(env, "epic").state === "ready") {
    return { profile: EPIC_VENDOR_PROFILE, encounter, performer };
  }
  if (
    backend === "oracle-health" &&
    assessSmartAuth(env, "oracle").state === "ready"
  ) {
    return { profile: ORACLE_VENDOR_PROFILE, encounter, performer };
  }
  return null;
}

export type ObservationApproval = {
  fields: { label: string; value: string }[];
  preview?: unknown;
  blocked?: string;
};

/**
 * The approval card's observation body. Same profile the write tool applies
 * after approval, so the reviewer sees the codings, encounter, and performer
 * that will be posted. A refusal blocks the approve button.
 */
export function buildObservationApproval(input: {
  patientId: string;
  label: string;
  value: number;
  unit: string;
  encounter?: string;
  performer?: string;
  vendor: VendorWriteContext | null;
}): ObservationApproval {
  const coded = codeObservation(input.label, input.unit);
  const baseFields = [
    { label: "Patient", value: `Patient/${input.patientId}` },
    { label: "Label", value: input.label },
    { label: "Value", value: `${input.value} ${input.unit}` },
  ];
  const draft: Observation = {
    resourceType: "Observation",
    status: "final",
    code: coded.code,
    ...(coded.category ? { category: coded.category } : {}),
    subject: { reference: `Patient/${input.patientId}` },
    effectiveDateTime: "<server time when approved>",
    valueQuantity: {
      value: input.value,
      unit: input.unit,
      ...(coded.ucum ? { system: UCUM_SYSTEM, code: coded.ucum } : {}),
    },
    ...(input.encounter ? { encounter: { reference: input.encounter } } : {}),
  };
  const hints: VendorWriteHints = {
    encounter: input.encounter ?? input.vendor?.encounter,
    performer: input.performer ?? input.vendor?.performer,
  };
  try {
    const shaped = applyVendorProfile(
      input.vendor?.profile,
      draft,
      hints,
    ) as Observation;
    const postedUnit = shaped.valueQuantity?.unit ?? input.unit;
    return {
      fields: [
        ...baseFields.slice(0, 2),
        { label: "Value", value: `${input.value} ${postedUnit}` },
        ...codingFields(shaped, postedUnit, coded.ucum),
      ],
      preview: shaped,
    };
  } catch (error) {
    const blocked =
      error instanceof VendorWriteError
        ? error.message
        : "This observation cannot be prepared for the sandbox.";
    return { fields: baseFields, blocked };
  }
}

function codingFields(
  resource: Observation,
  unit: string,
  ucum: string | undefined,
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const coding of resource.code?.coding ?? []) {
    if (coding.system === EPIC_FLOWSHEET_SYSTEM) {
      rows.push({
        label: "Code",
        value: `Epic flowsheet ${coding.code} — ${coding.display ?? coding.code}`,
      });
    } else if (coding.system === LOINC_SYSTEM) {
      rows.push({
        label: "Code",
        value: `LOINC ${coding.code}${coding.display ? ` — ${coding.display}` : ""}`,
      });
    }
  }
  if (rows.length === 0) {
    rows.push({
      label: "Code",
      value: `${resource.code?.text ?? "Observation"} (text only — no standard code)`,
    });
  }
  if (resource.encounter?.reference) {
    rows.push({ label: "Encounter", value: resource.encounter.reference });
  }
  const performer = resource.performer?.[0]?.reference;
  if (performer) {
    rows.push({
      label: "Performer",
      value: `${performer} (legal authenticator)`,
    });
  }
  rows.push(
    ucum
      ? { label: "Unit", value: `UCUM ${ucum}` }
      : { label: "Unit", value: `${unit} (no UCUM code — saved as text)` },
  );
  return rows;
}
