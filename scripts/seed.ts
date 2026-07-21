import { config as loadEnv } from "dotenv";
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
} from "@medplum/fhirtypes";

import type { FhirBackend } from "../lib/fhir/backend";
import { createSeedBackend, wipePatient } from "./seed-lib";
import {
  SYNTHETIC_SYSTEM,
  patients,
  type SyntheticPatient,
} from "./fixtures/patients";

// Load .env.local then .env so `npm run seed` works after `cp .env.example
// .env.local`. Real shell env always wins (dotenv doesn't override by default).
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

function codeable(text: string, coding?: Coding): CodeableConcept {
  return coding ? { text, coding: [{ ...coding, display: text }] } : { text };
}

async function createChart(
  backend: FhirBackend,
  p: SyntheticPatient,
): Promise<number> {
  const patient = await backend.createResource<Patient>({
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
    await backend.createResource<Condition>({
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
    await backend.createResource<MedicationRequest>({
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
    await backend.createResource<AllergyIntolerance>({
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
    await backend.createResource<Immunization>({
      resourceType: "Immunization",
      status: "completed",
      vaccineCode: { text: i.text },
      patient: subject,
      occurrenceDateTime: i.date,
    });
    count++;
  }

  for (const o of p.observations) {
    await backend.createResource<Observation>({
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
  const { backend, target } = await createSeedBackend({
    // Adapter targets (firely/aidbox/oystehr) fail closed without this,
    // matching the safety eval's posture: npm run seed -- --confirm-synthetic
    confirmSyntheticTarget: process.argv.includes("--confirm-synthetic"),
  });

  // Wipe + recreate each patient so the seed is idempotent: re-running always
  // produces one clean chart per patient instead of duplicating.
  let total = 0;
  for (const p of patients) {
    await wipePatient(backend, p.key);
    total += await createChart(backend, p);
  }

  console.log(
    `\nSeeded ${patients.length} synthetic patients (${total} resources) into ${target}.`,
  );
  console.log('Done. Open /demo and ask: "find patients named Smith".');
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
