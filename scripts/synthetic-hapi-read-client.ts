import type {
  AllergyIntolerance,
  Bundle,
  Condition,
  ExtractResource,
  Immunization,
  MedicationRequest,
  Observation,
  Patient,
  ResourceType,
} from "@medplum/fhirtypes";

import { SYNTHETIC_SYSTEM } from "@/lib/fhir/synthetic";
import {
  patients as syntheticPatients,
  type SyntheticPatient,
} from "@/scripts/fixtures/patients";

import type { MedplumReadClient } from "../packages/mcp/src/read-tools.js";
import { HapiBackend } from "../lib/fhir/hapi";

const ALLOWED_CHART_TYPES = new Set<ResourceType>([
  "Condition",
  "AllergyIntolerance",
  "Observation",
  "Communication",
  "MedicationRequest",
  "Immunization",
]);

type SyntheticPatientResource = ExtractResource<"Patient">;
type SyntheticPatientRecord = {
  fixture: SyntheticPatient;
  patient: SyntheticPatientResource;
};

function fixturePatient(
  fixture: SyntheticPatient,
  id: string,
): SyntheticPatientResource {
  return {
    resourceType: "Patient",
    id,
    identifier: [{ system: SYNTHETIC_SYSTEM, value: fixture.key }],
    name: [{ use: "official", family: fixture.family, given: fixture.given }],
    gender: fixture.gender,
    birthDate: fixture.birthDate,
    telecom: fixture.email
      ? [{ system: "email", value: fixture.email }]
      : undefined,
    address: [{ ...fixture.address, country: "US" }],
  };
}

function isExpectedFixtureChartResource(
  resourceType: ResourceType,
  resource: unknown,
  fixture: SyntheticPatient,
): boolean {
  switch (resourceType) {
    case "Condition": {
      const condition = resource as Condition;
      return fixture.conditions.some(
        (expected) => condition.code?.text === expected.text,
      );
    }
    case "AllergyIntolerance": {
      const allergy = resource as AllergyIntolerance;
      return fixture.allergies.some(
        (expected) => allergy.code?.text === expected.text,
      );
    }
    case "Observation": {
      const observation = resource as Observation;
      return fixture.observations.some(
        (expected) =>
          observation.code?.text === expected.text &&
          observation.effectiveDateTime === expected.date &&
          observation.valueQuantity?.value === expected.value &&
          observation.valueQuantity.unit === expected.unit,
      );
    }
    case "MedicationRequest": {
      const medication = resource as MedicationRequest;
      return fixture.medications.some(
        (expected) =>
          medication.medicationCodeableConcept?.text === expected.text &&
          medication.dosageInstruction?.[0]?.text === expected.dosage,
      );
    }
    case "Immunization": {
      const immunization = resource as Immunization;
      return fixture.immunizations.some(
        (expected) =>
          immunization.vaccineCode?.text === expected.text &&
          immunization.occurrenceDateTime === expected.date,
      );
    }
    // The seed has no Communications. Deliberately excluding all of them
    // prevents a stale local note from becoming an unexpected data path.
    case "Communication":
      return false;
    default:
      return false;
  }
}

function patientMatchesName(patient: Patient, query: string): boolean {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const searchableName = (patient.name ?? [])
    .flatMap((name) => [...(name.given ?? []), name.family ?? ""])
    .join(" ")
    .toLowerCase();

  return terms.length > 0 && terms.every((term) => searchableName.includes(term));
}

function patientIdFromSubject(subject: string | undefined): string | undefined {
  const match = subject?.match(/^Patient\/([^/]+)$/);
  return match?.[1];
}

function chartPatientId(
  resourceType: ResourceType,
  params: Record<string, string> | undefined,
): string | undefined {
  return resourceType === "Communication"
    ? patientIdFromSubject(params?.subject)
    : params?.patient;
}

/**
 * A deliberately narrow read facade for the checkout-only HAPI Local Lab.
 *
 * The HAPI compose stack itself is unauthenticated. Rather than trusting that
 * a long-lived local volume contains only fixture data, this client resolves
 * the four fixture identifiers once and refuses patient ids or resource types
 * outside that set. It has no create or delete methods by design.
 */
export class SyntheticHapiReadClient implements MedplumReadClient {
  private constructor(
    private readonly backend: MedplumReadClient,
    private readonly patientsById: Map<string, SyntheticPatientRecord>,
  ) {}

  static async connect(baseUrl: string): Promise<SyntheticHapiReadClient> {
    return SyntheticHapiReadClient.fromBackend(new HapiBackend(baseUrl));
  }

  static async fromBackend(
    backend: MedplumReadClient,
  ): Promise<SyntheticHapiReadClient> {
    const resolved = await Promise.all(
      syntheticPatients.map(async (fixture) => ({
        fixture,
        records: await backend.searchResources("Patient", {
          identifier: `${SYNTHETIC_SYSTEM}|${fixture.key}`,
          _count: "2",
        }),
      })),
    );

    const missing = resolved
      .filter(({ records }) => records.length === 0)
      .map(({ fixture }) => fixture.key);
    const duplicated = resolved
      .filter(({ records }) => records.length > 1)
      .map(({ fixture }) => fixture.key);

    if (missing.length > 0 || duplicated.length > 0) {
      const details = [
        missing.length > 0 ? `missing ${missing.join(", ")}` : "",
        duplicated.length > 0 ? `duplicate ${duplicated.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; ");
      throw new Error(
        `The synthetic HAPI fixture set is not ready (${details}). Run npm run mcp:demo from the repository root.`,
      );
    }

    const entries = resolved.flatMap(({ fixture, records }) => {
      const id = records[0]?.id;
      return id
        ? [{ fixture, patient: fixturePatient(fixture, id) }]
        : [];
    });
    const patientsById = new Map(
      entries.map((record) => [record.patient.id as string, record]),
    );

    if (patientsById.size !== syntheticPatients.length) {
      throw new Error(
        "The synthetic HAPI fixture set is invalid. Run npm run mcp:demo from the repository root.",
      );
    }

    return new SyntheticHapiReadClient(backend, patientsById);
  }

  async search<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<Bundle<ExtractResource<K>>> {
    if (resourceType !== "Patient") {
      throw new Error("The synthetic HAPI Local Lab only permits patient searches.");
    }

    const matches = [...this.patientsById.values()].filter((record) =>
      patientMatchesName(record.patient, params?.name ?? ""),
    );

    return {
      resourceType: "Bundle",
      type: "searchset",
      total: matches.length,
      entry: matches.map(({ patient }) => ({
        resource: patient as ExtractResource<K>,
      })),
    } as Bundle<ExtractResource<K>>;
  }

  async searchResources<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<ExtractResource<K>[]> {
    if (resourceType === "Patient") {
      const patient = params?._id ? this.patientsById.get(params._id) : undefined;
      return patient ? [patient.patient as ExtractResource<K>] : [];
    }

    if (!ALLOWED_CHART_TYPES.has(resourceType)) {
      throw new Error("The synthetic HAPI Local Lab refuses this resource type.");
    }

    const patientId = chartPatientId(resourceType, params);
    const record = patientId ? this.patientsById.get(patientId) : undefined;
    if (!patientId || !record) {
      return [];
    }

    const constrainedParams: Record<string, string> =
      resourceType === "Communication"
        ? { subject: `Patient/${patientId}` }
        : { patient: patientId };
    if (params?._sort) constrainedParams._sort = params._sort;
    if (params?._count) constrainedParams._count = params._count;

    const resources = await this.backend.searchResources(
      resourceType,
      constrainedParams,
    );
    return resources.filter((resource) =>
      isExpectedFixtureChartResource(resourceType, resource, record.fixture),
    );
  }
}

export const SYNTHETIC_PATIENT_KEYS = syntheticPatients.map(
  (patient: SyntheticPatient) => patient.key,
);
