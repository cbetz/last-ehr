import type {
  AllergyIntolerance,
  CodeableConcept,
  Coding,
  Condition,
  DocumentReference,
  Immunization,
  MedicationRequest,
  Observation,
  Patient,
  Reference,
  Resource,
} from "@medplum/fhirtypes";

/**
 * Same identifier system as lib/fhir/synthetic.ts. The package cannot import
 * the web app, so memory-seed.test.ts asserts the two strings stay equal.
 */
export const SYNTHETIC_IDENTIFIER_SYSTEM = "https://lastehr.com/synthetic";

/** Replaced with Patient/{id} after the Patient create assigns an id. */
export const SUBJECT_REFERENCE = "Patient/__subject__";

export type SyntheticChartInput = {
  key: string;
  family: string;
  given: string[];
  gender: "male" | "female" | "other" | "unknown";
  birthDate: string;
  email?: string;
  address: { line: string[]; city: string; state: string; postalCode: string };
  conditions: { text: string; snomed?: string }[];
  medications: { text: string; dosage: string }[];
  allergies: {
    text: string;
    snomed?: string;
    reaction?: string;
    criticality?: "low" | "high";
  }[];
  immunizations: { text: string; date: string }[];
  observations: {
    category: "vital-signs" | "laboratory";
    text: string;
    loinc: string;
    value: number;
    unit: string;
    ucum?: string;
    date: string;
  }[];
  documents: {
    text: string;
    loinc: string;
    display: string;
    date: string;
    contentType: string;
    body?: string;
    urlPath?: string;
  }[];
};

export type SyntheticChart = {
  patient: Patient;
  /** References still say Patient/__subject__. Bind them after create. */
  related: Resource[];
};

function codeable(text: string, coding?: Coding): CodeableConcept {
  return coding ? { text, coding: [{ ...coding, display: text }] } : { text };
}

function rewrite(value: unknown, from: string, to: string): unknown {
  if (typeof value === "string") return value === from ? to : value;
  if (Array.isArray(value)) return value.map((item) => rewrite(item, from, to));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewrite(item, from, to)]),
    );
  }
  return value;
}

/** Point every Patient/__subject__ reference at the created Patient. */
export function bindSubject<T>(resource: T, patientId: string): T {
  if (!/^[A-Za-z0-9.-]{1,64}$/.test(patientId)) {
    throw new Error("Patient id is not a valid FHIR id.");
  }
  return rewrite(resource, SUBJECT_REFERENCE, `Patient/${patientId}`) as T;
}

/**
 * The chart `scripts/seed.ts` writes, as resources instead of backend calls,
 * so the in-memory store and `npm run seed` cannot drift apart.
 */
export function syntheticChartResources(p: SyntheticChartInput): SyntheticChart {
  const subject: Reference<Patient> = { reference: SUBJECT_REFERENCE };
  const patient: Patient = {
    resourceType: "Patient",
    identifier: [{ system: SYNTHETIC_IDENTIFIER_SYSTEM, value: p.key }],
    name: [{ use: "official", family: p.family, given: p.given }],
    gender: p.gender,
    birthDate: p.birthDate,
    ...(p.email ? { telecom: [{ system: "email", value: p.email }] } : {}),
    address: [{ ...p.address, country: "US" }],
  };
  const related: Resource[] = [];

  for (const c of p.conditions) {
    const condition: Condition = {
      resourceType: "Condition",
      clinicalStatus: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
            code: "active",
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
            code: "confirmed",
          },
        ],
      },
      code: codeable(
        c.text,
        c.snomed ? { system: "http://snomed.info/sct", code: c.snomed } : undefined,
      ),
      subject,
    };
    related.push(condition);
  }

  for (const m of p.medications) {
    const medication: MedicationRequest = {
      resourceType: "MedicationRequest",
      status: "active",
      intent: "order",
      medicationCodeableConcept: { text: m.text },
      subject,
      dosageInstruction: [{ text: m.dosage }],
    };
    related.push(medication);
  }

  for (const a of p.allergies) {
    const allergy: AllergyIntolerance = {
      resourceType: "AllergyIntolerance",
      clinicalStatus: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
            code: "active",
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
            code: "confirmed",
          },
        ],
      },
      code: codeable(
        a.text,
        a.snomed ? { system: "http://snomed.info/sct", code: a.snomed } : undefined,
      ),
      patient: subject,
      ...(a.criticality ? { criticality: a.criticality } : {}),
      ...(a.reaction ? { reaction: [{ manifestation: [{ text: a.reaction }] }] } : {}),
    };
    related.push(allergy);
  }

  for (const i of p.immunizations) {
    const immunization: Immunization = {
      resourceType: "Immunization",
      status: "completed",
      vaccineCode: { text: i.text },
      patient: subject,
      occurrenceDateTime: i.date,
    };
    related.push(immunization);
  }

  for (const o of p.observations) {
    const observation: Observation = {
      resourceType: "Observation",
      status: "final",
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/observation-category",
              code: o.category,
            },
          ],
        },
      ],
      code: codeable(o.text, { system: "http://loinc.org", code: o.loinc }),
      subject,
      effectiveDateTime: o.date,
      valueQuantity: {
        value: o.value,
        unit: o.unit,
        ...(o.ucum ? { system: "http://unitsofmeasure.org", code: o.ucum } : {}),
      },
    };
    related.push(observation);
  }

  for (const d of p.documents) {
    const document: DocumentReference = {
      resourceType: "DocumentReference",
      status: "current",
      type: codeable(d.display, { system: "http://loinc.org", code: d.loinc }),
      category: [
        {
          coding: [
            {
              system:
                "http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category",
              code: "clinical-note",
            },
          ],
        },
      ],
      subject,
      date: `${d.date}T00:00:00Z`,
      description: d.text,
      content: [
        {
          attachment: {
            contentType: d.contentType,
            title: d.text,
            ...(d.body
              ? {
                  data: Buffer.from(d.body, "utf8").toString("base64"),
                  size: Buffer.byteLength(d.body, "utf8"),
                }
              : {}),
            ...(d.urlPath ? { url: d.urlPath } : {}),
          },
        },
      ],
    };
    related.push(document);
  }

  return { patient, related };
}
