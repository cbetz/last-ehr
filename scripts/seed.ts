import { config as loadEnv } from "dotenv";
import type { Patient } from "@medplum/fhirtypes";

import type { FhirBackend } from "../lib/fhir/backend";
import {
  bindSubject,
  syntheticChartResources,
} from "../packages/mcp/src/synthetic-chart";
import { createSeedBackend, wipePatient } from "./seed-lib";
import {
  patients,
  type SyntheticPatient,
} from "./fixtures/patients";

// Load .env.local then .env so `npm run seed` works after `cp .env.example
// .env.local`. Real shell env always wins (dotenv doesn't override by default).
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

async function createChart(
  backend: FhirBackend,
  p: SyntheticPatient,
): Promise<number> {
  const chart = syntheticChartResources(p);
  const patient = await backend.createResource<Patient>(chart.patient);
  let count = 1;
  for (const resource of chart.related) {
    await backend.createResource(bindSubject(resource, patient.id));
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
