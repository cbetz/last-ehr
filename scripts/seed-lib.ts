import { MedplumClient } from "@medplum/core";
import type { ResourceType } from "@medplum/fhirtypes";

import type { FhirBackend } from "../lib/fhir/backend";
import { AidboxBackend } from "../lib/fhir/aidbox";
import { FirelyBackend } from "../lib/fhir/firely";
import { MedplumBackend } from "../lib/fhir/medplum";
import { HapiBackend } from "../lib/fhir/hapi";
import { OystehrBackend } from "../lib/fhir/oystehr";
import { SYNTHETIC_SYSTEM } from "./fixtures/patients";

// Child resource types owned by a synthetic patient, deleted before recreating.
export const CHILD_TYPES: ResourceType[] = [
  "Communication",
  "Observation",
  "Condition",
  "AllergyIntolerance",
  "MedicationRequest",
  "Immunization",
  "Task",
];

/**
 * Remove any existing copy of a synthetic patient and everything that
 * references it, so re-running the seed always yields one clean chart.
 * Scoped to the synthetic identifier, so it never touches other data.
 *
 * Children are deleted before the patient, and each child search loops until
 * it comes back empty: servers clamp _count (HAPI caps pages around 200), so
 * a single page is not a guarantee that everything was seen.
 *
 * Provenance rows emitted by the opt-in write-audit trail
 * (LASTEHR_WRITE_PROVENANCE) target child resources, so on servers that
 * enforce referential integrity on delete they would block the child
 * deletes; each page sweeps them first. Results are re-checked against the
 * ids being wiped so a server that ignores the target parameter can never
 * cause a foreign Provenance to be deleted.
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
        const childRefs = children
          .filter((child) => child.id)
          .map((child) => `${type}/${child.id}`);
        const wipeSet = new Set(childRefs);
        for (let i = 0; i < childRefs.length; i += 40) {
          const chunk = childRefs.slice(i, i + 40);
          const provenances = await backend.searchResources("Provenance", {
            target: chunk.join(","),
            _count: "200",
          });
          for (const provenance of provenances) {
            const targets = provenance.target ?? [];
            if (
              provenance.id &&
              targets.some(
                (target) => target.reference && wipeSet.has(target.reference),
              )
            ) {
              await backend.deleteResource("Provenance", provenance.id);
            }
          }
        }
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
 * to FHIR_BASE_URL) with no credentials; firely/aidbox are the
 * synthetic-evaluation adapters and, like the safety eval, fail closed
 * without an explicit synthetic-target confirmation (the seed deletes and
 * recreates matching charts); the default is Medplum via
 * MEDPLUM_ACCESS_TOKEN or a client-credentials login.
 */
export async function createSeedBackend({
  confirmSyntheticTarget = false,
}: { confirmSyntheticTarget?: boolean } = {}): Promise<{
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

  if (kind === "firely" || kind === "aidbox" || kind === "oystehr") {
    if (!confirmSyntheticTarget) {
      throw new Error(
        `FHIR_BACKEND=${kind} seeds an adapter target: the seed deletes and recreates synthetic charts, so it must only run against a disposable synthetic sandbox. Re-run with: npm run seed -- --confirm-synthetic`,
      );
    }
    if (kind === "oystehr") {
      const clientId = process.env.OYSTEHR_CLIENT_ID;
      const clientSecret = process.env.OYSTEHR_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error(
          "FHIR_BACKEND=oystehr requires OYSTEHR_CLIENT_ID and OYSTEHR_CLIENT_SECRET (an M2M client; see docs/adapters.md).",
        );
      }
      const baseUrl = process.env.OYSTEHR_BASE_URL || undefined;
      return {
        backend: new OystehrBackend({
          clientId,
          clientSecret,
          baseUrl,
          projectId: process.env.OYSTEHR_PROJECT_ID || undefined,
        }),
        target: baseUrl ?? "Oystehr's hosted FHIR API",
      };
    }
    if (kind === "firely") {
      const baseUrl = process.env.FIRELY_BASE_URL || process.env.FHIR_BASE_URL;
      if (!baseUrl) {
        throw new Error(
          "FHIR_BACKEND=firely requires FIRELY_BASE_URL or FHIR_BASE_URL (for example https://server.fire.ly).",
        );
      }
      return {
        backend: new FirelyBackend(
          baseUrl,
          process.env.FIRELY_ACCESS_TOKEN || undefined,
        ),
        target: baseUrl,
      };
    }
    const baseUrl = process.env.AIDBOX_BASE_URL || process.env.FHIR_BASE_URL;
    const clientId = process.env.AIDBOX_CLIENT_ID;
    const clientSecret = process.env.AIDBOX_CLIENT_SECRET;
    if (!baseUrl || !clientId || !clientSecret) {
      throw new Error(
        "FHIR_BACKEND=aidbox requires AIDBOX_BASE_URL or FHIR_BASE_URL (the box's /fhir endpoint) plus AIDBOX_CLIENT_ID and AIDBOX_CLIENT_SECRET.",
      );
    }
    return {
      backend: new AidboxBackend(baseUrl, clientId, clientSecret),
      target: baseUrl,
    };
  }

  if (kind !== "medplum") {
    throw new Error(
      `Unknown FHIR_BACKEND "${kind}". Supported values: medplum, hapi, firely, aidbox, oystehr.`,
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
