import { config as loadEnv } from "dotenv";
import { MedplumClient } from "@medplum/core";
import type {
  AllergyIntolerance,
  CodeableConcept,
  Coding,
  Condition,
  Immunization,
  MedicationRequest,
  Observation,
  Patient,
  Reference,
  ResourceType,
} from "@medplum/fhirtypes";

import {
  SYNTHETIC_SYSTEM,
  patients,
  type SyntheticPatient,
} from "./fixtures/patients";

// Load .env.local then .env so `npm run seed` works after `cp .env.example
// .env.local`. Real shell env always wins (dotenv doesn't override by default).
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// Child resource types owned by a synthetic patient, deleted before recreating.
const CHILD_TYPES: ResourceType[] = [
  "Communication",
  "Observation",
  "Condition",
  "AllergyIntolerance",
  "MedicationRequest",
  "Immunization",
];

function codeable(text: string, coding?: Coding): CodeableConcept {
  return coding ? { text, coding: [{ ...coding, display: text }] } : { text };
}

/**
 * Remove any existing copy of a synthetic patient and everything that
 * references it, so re-running the seed always yields one clean chart (rather
 * than duplicating). Scoped to our synthetic identifier, so it never touches a
 * self-hoster's other data.
 */
async function wipePatient(medplum: MedplumClient, key: string): Promise<void> {
  const existing = await medplum.searchResources("Patient", {
    identifier: `${SYNTHETIC_SYSTEM}|${key}`,
  });
  for (const patient of existing) {
    if (!patient.id) continue;
    for (const type of CHILD_TYPES) {
      const query =
        type === "Communication"
          ? { subject: `Patient/${patient.id}`, _count: "1000" }
          : { patient: patient.id, _count: "1000" };
      const children = await medplum.searchResources(type, query);
      for (const child of children) {
        if (child.id) await medplum.deleteResource(type, child.id);
      }
    }
    await medplum.deleteResource("Patient", patient.id);
  }
}

async function createChart(
  medplum: MedplumClient,
  p: SyntheticPatient,
): Promise<number> {
  const patient = await medplum.createResource<Patient>({
    resourceType: "Patient",
    identifier: [{ system: SYNTHETIC_SYSTEM, value: p.key }],
    name: [{ use: "official", family: p.family, given: p.given }],
    gender: p.gender,
    birthDate: p.birthDate,
    telecom: p.email ? [{ system: "email", value: p.email }] : undefined,
    address: [{ ...p.address, country: "US" }],
  });
  const subject: Reference<Patient> = { reference: `Patient/${patient.id}` };
  let count = 1;

  for (const c of p.conditions) {
    await medplum.createResource<Condition>({
      resourceType: "Condition",
      clinicalStatus: {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/condition-clinical",
            code: "active",
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/condition-ver-status",
            code: "confirmed",
          },
        ],
      },
      code: codeable(
        c.text,
        c.snomed
          ? { system: "http://snomed.info/sct", code: c.snomed }
          : undefined,
      ),
      subject,
    });
    count++;
  }

  for (const m of p.medications) {
    await medplum.createResource<MedicationRequest>({
      resourceType: "MedicationRequest",
      status: "active",
      intent: "order",
      medicationCodeableConcept: { text: m.text },
      subject,
      dosageInstruction: [{ text: m.dosage }],
    });
    count++;
  }

  for (const a of p.allergies) {
    await medplum.createResource<AllergyIntolerance>({
      resourceType: "AllergyIntolerance",
      clinicalStatus: {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
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
        a.snomed
          ? { system: "http://snomed.info/sct", code: a.snomed }
          : undefined,
      ),
      patient: subject,
      criticality: a.criticality || undefined,
      reaction: a.reaction
        ? [{ manifestation: [{ text: a.reaction }] }]
        : undefined,
    });
    count++;
  }

  for (const i of p.immunizations) {
    await medplum.createResource<Immunization>({
      resourceType: "Immunization",
      status: "completed",
      vaccineCode: { text: i.text },
      patient: subject,
      occurrenceDateTime: i.date,
    });
    count++;
  }

  for (const o of p.observations) {
    await medplum.createResource<Observation>({
      resourceType: "Observation",
      status: "final",
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/observation-category",
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
        ...(o.ucum
          ? { system: "http://unitsofmeasure.org", code: o.ucum }
          : {}),
      },
    });
    count++;
  }

  console.log(`  ${p.given.join(" ")} ${p.family}: ${count} resources`);
  return count;
}

async function main(): Promise<void> {
  const baseUrl = process.env.MEDPLUM_BASE_URL || undefined;
  const accessToken = process.env.MEDPLUM_ACCESS_TOKEN;
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;

  if (!accessToken && !(clientId && clientSecret)) {
    console.error(
      "Seeding needs write access to your Medplum project. Set either:\n" +
        "  - MEDPLUM_CLIENT_ID + MEDPLUM_CLIENT_SECRET (a ClientApplication with write access), or\n" +
        "  - MEDPLUM_ACCESS_TOKEN (a token from an account that can write).",
    );
    process.exit(1);
  }

  const medplum = new MedplumClient({ baseUrl });
  if (accessToken) {
    medplum.setAccessToken(accessToken);
  } else {
    await medplum.startClientLogin(clientId as string, clientSecret as string);
  }

  // Wipe + recreate each patient so the seed is idempotent: re-running always
  // produces one clean chart per patient instead of duplicating.
  let total = 0;
  for (const p of patients) {
    await wipePatient(medplum, p.key);
    total += await createChart(medplum, p);
  }

  console.log(
    `\nSeeded ${patients.length} synthetic patients (${total} resources) into ${
      baseUrl ?? "Medplum's hosted API"
    }.`,
  );
  console.log('Done. Open /demo and ask: "find patients named Smith".');
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
