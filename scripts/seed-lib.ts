import { MedplumClient } from "@medplum/core";
import type { ResourceType } from "@medplum/fhirtypes";

import type { FhirBackend } from "../lib/fhir/backend";
import { MedplumBackend } from "../lib/fhir/medplum";
import { HapiBackend } from "../lib/fhir/hapi";
import { SYNTHETIC_SYSTEM } from "./fixtures/patients";

// Child resource types owned by a synthetic patient, deleted before recreating.
export const CHILD_TYPES: ResourceType[] = [
  "Communication",
  "Observation",
  "Condition",
  "AllergyIntolerance",
  "MedicationRequest",
  "Immunization",
];

/**
 * Remove any existing copy of a synthetic patient and everything that
 * references it, so re-running the seed always yields one clean chart.
 * Scoped to the synthetic identifier, so it never touches other data.
 *
 * Children are deleted before the patient, and each child search loops until
 * it comes back empty: servers clamp _count (HAPI caps pages around 200), so
 * a single page is not a guarantee that everything was seen.
 */
export async function wipePatient(
  backend: FhirBackend,
  key: string,
): Promise<void> {
  const existing = await backend.searchResources("Patient", {
    identifier: `${SYNTHETIC_SYSTEM}|${key}`,
  });
  for (const patient of existing) {
    if (!patient.id) continue;
    for (const type of CHILD_TYPES) {
      for (;;) {
        const query: Record<string, string> =
          type === "Communication"
            ? { subject: `Patient/${patient.id}`, _count: "200" }
            : { patient: patient.id, _count: "200" };
        const children = await backend.searchResources(type, query);
        if (children.length === 0) break;
        let deleted = 0;
        for (const child of children) {
          if (child.id) {
            await backend.deleteResource(type, child.id);
            deleted++;
          }
        }
        // A page with nothing deletable would loop forever; bail instead.
        if (deleted === 0) break;
      }
    }
    try {
      await backend.deleteResource("Patient", patient.id);
    } catch (err) {
      throw new Error(
        `Could not delete Patient/${patient.id}. Something may still ` +
          `reference it (a resource type outside the seed's child list, or a ` +
          `server enforcing referential integrity on delete). Delete the ` +
          `referrers and re-run.`,
        { cause: err },
      );
    }
  }
}

/**
 * Resolve the backend the seed writes to, mirroring the app's own factory:
 * FHIR_BACKEND=hapi hits an open FHIR server at HAPI_BASE_URL (falling back
 * to FHIR_BASE_URL) with no credentials; the default is Medplum via
 * MEDPLUM_ACCESS_TOKEN or a client-credentials login.
 */
export async function createSeedBackend(): Promise<{
  backend: FhirBackend;
  target: string;
}> {
  const kind = process.env.FHIR_BACKEND || "medplum";

  if (kind === "hapi") {
    const baseUrl = process.env.HAPI_BASE_URL || process.env.FHIR_BASE_URL;
    if (!baseUrl) {
      throw new Error(
        "FHIR_BACKEND=hapi requires HAPI_BASE_URL or FHIR_BASE_URL (for example http://localhost:8080/fhir).",
      );
    }
    return { backend: new HapiBackend(baseUrl), target: baseUrl };
  }

  if (kind !== "medplum") {
    throw new Error(
      `Unknown FHIR_BACKEND "${kind}". Supported values: medplum, hapi.`,
    );
  }

  const baseUrl = process.env.MEDPLUM_BASE_URL || undefined;
  const accessToken = process.env.MEDPLUM_ACCESS_TOKEN;
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;

  if (!accessToken && !(clientId && clientSecret)) {
    throw new Error(
      "Seeding needs write access to your Medplum project. Set either:\n" +
        "  - MEDPLUM_CLIENT_ID + MEDPLUM_CLIENT_SECRET (a ClientApplication with write access), or\n" +
        "  - MEDPLUM_ACCESS_TOKEN (a token from an account that can write),\n" +
        "or set FHIR_BACKEND=hapi + HAPI_BASE_URL (or FHIR_BASE_URL) for a local open FHIR server.",
    );
  }

  const medplum = new MedplumClient({ baseUrl });
  if (accessToken) {
    medplum.setAccessToken(accessToken);
  } else {
    await medplum.startClientLogin(clientId as string, clientSecret as string);
  }
  return {
    backend: new MedplumBackend(medplum),
    target: baseUrl ?? "Medplum's hosted API",
  };
}
