import { MemoryFhirClient } from "./memory.js";
import { bindSubject, syntheticChartResources } from "./synthetic-chart.js";
import { syntheticPatients } from "./synthetic-patients.js";

/** Load the repository's synthetic fixture charts into a memory store. */
export async function seedMemoryClient(client: MemoryFhirClient): Promise<void> {
  for (const fixture of syntheticPatients) {
    const chart = syntheticChartResources(fixture);
    const patient = await client.createResource(chart.patient);
    for (const resource of chart.related) {
      await client.createResource(bindSubject(resource, patient.id));
    }
  }
}

/** One process-lifetime store, seeded from the synthetic fixture charts. */
export async function createSeededMemoryClient(): Promise<MemoryFhirClient> {
  const client = new MemoryFhirClient();
  await seedMemoryClient(client);
  return client;
}
