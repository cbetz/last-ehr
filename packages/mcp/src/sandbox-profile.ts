import type { Observation, Resource } from "@medplum/fhirtypes";

import { LOINC_SYSTEM } from "./vitals.js";

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
