import type {
  Bundle,
  ExtractResource,
  Observation,
  Patient,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";

import type { FhirBackend } from "./backend";
import { AIAST_LABEL } from "./labels";
import { codeObservation, UCUM_SYSTEM } from "./vitals";
import {
  SCRIPTED_DEMO_PATIENT_KEY,
  SYNTHETIC_SYSTEM,
} from "./synthetic";

const syntheticPatientIdentifier =
  `${SYNTHETIC_SYSTEM}|${SCRIPTED_DEMO_PATIENT_KEY}`;
const DEMO_TAG_SYSTEM = "http://lastehr.demo";

function isScriptedPatient(resource: Resource | undefined): resource is Patient {
  return (
    resource?.resourceType === "Patient" &&
    resource.identifier?.some(
      (identifier) =>
        identifier.system === SYNTHETIC_SYSTEM &&
        identifier.value === SCRIPTED_DEMO_PATIENT_KEY,
    ) === true
  );
}

/**
 * Restricts the no-key scripted demonstration to one known synthetic patient
 * and one known Observation write. This keeps the convenience mode incapable
 * of reading or mutating arbitrary records even on a local HAPI instance.
 */
// The fixed synthetic write this wrapper permits.
const SCRIPTED_LABEL = "Heart rate";
const SCRIPTED_UNIT = "bpm";
const SCRIPTED_VALUE = 72;

export class ScriptedDemoBackend implements FhirBackend {
  constructor(
    private readonly backend: FhirBackend,
    private readonly sessionId?: string,
  ) {}

  search<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<Bundle<ExtractResource<K>>> {
    // The caller's parameters are intentionally discarded before the request.
    void params;
    if (resourceType !== "Patient") {
      throw new Error("The scripted demo can search only its synthetic patient.");
    }
    return this.backend.search("Patient", {
      identifier: syntheticPatientIdentifier,
      _count: "1",
    }).then(
      (bundle) =>
        ({
          ...bundle,
          entry: bundle.entry?.filter((entry) =>
            isScriptedPatient(entry.resource),
          ),
        }) as Bundle<ExtractResource<K>>,
    );
  }

  async searchResources<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<ExtractResource<K>[]> {
    // The caller's parameters are intentionally discarded before the request.
    void params;
    if (resourceType !== "Patient") {
      throw new Error("The scripted demo can read only its synthetic patient.");
    }
    const patients = await this.backend.searchResources("Patient", {
      identifier: syntheticPatientIdentifier,
      _count: "1",
    });
    return patients.filter(isScriptedPatient) as ExtractResource<K>[];
  }

  async createResource<T extends Resource>(
    resource: T,
  ): Promise<T & { id: string }> {
    // The one write this wrapper permits, derived from the shared coding
    // table so the guard and the canonical resource below cannot drift
    // apart from what the real write tools build.
    const canonical = codeObservation(SCRIPTED_LABEL, SCRIPTED_UNIT);
    if (
      resource.resourceType !== "Observation" ||
      resource.status !== "final" ||
      resource.code?.text !== SCRIPTED_LABEL ||
      resource.valueQuantity?.value !== SCRIPTED_VALUE ||
      resource.valueQuantity?.unit !== SCRIPTED_UNIT ||
      resource.valueQuantity?.system !== UCUM_SYSTEM ||
      resource.valueQuantity?.code !== canonical.ucum
    ) {
      throw new Error(
        "The scripted demo can create only its fixed synthetic heart-rate observation.",
      );
    }

    const patients = await this.backend.searchResources("Patient", {
      identifier: syntheticPatientIdentifier,
      _count: "1",
    });
    const patient = patients.find(isScriptedPatient);
    if (!patient?.id) {
      throw new Error(
        "The scripted demo patient is missing. Run npm run seed and try again.",
      );
    }
    if (resource.subject?.reference !== `Patient/${patient.id}`) {
      throw new Error("The scripted demo can write only to its synthetic patient.");
    }

    // Do not forward the caller's resource object: this is a narrow safety
    // wrapper, so it writes only this canonical synthetic observation even if
    // another caller adds unexpected fields to the input object.
    const created = await this.backend.createResource<Observation>({
      resourceType: "Observation",
      status: "final",
      // Coded exactly as the real write tools code it (LOINC + vital-signs
      // category + a true UCUM unit), so the scripted path demonstrates the
      // same conformant write rather than a stripped-down lookalike.
      code: canonical.code,
      ...(canonical.category ? { category: canonical.category } : {}),
      subject: { reference: `Patient/${patient.id}` },
      effectiveDateTime: new Date().toISOString(),
      valueQuantity: {
        value: SCRIPTED_VALUE,
        unit: SCRIPTED_UNIT,
        ...(canonical.ucum
          ? { system: UCUM_SYSTEM, code: canonical.ucum }
          : {}),
      },
      // Recreate the browser session tag instead of accepting arbitrary meta
      // from the tool input, preserving local-demo isolation without widening
      // this wrapper's write surface. The AIAST security label is stamped
      // here too: it is constant mechanical metadata, so approved writes
      // stay AI-labeled even on this narrowed path.
      meta: {
        security: [AIAST_LABEL],
        ...(this.sessionId && /^[A-Za-z0-9-]{1,64}$/.test(this.sessionId)
          ? {
              tag: [
                {
                  system: DEMO_TAG_SYSTEM,
                  code: `session-${this.sessionId}`,
                },
              ],
            }
          : {}),
      },
    });
    return created as unknown as T & { id: string };
  }

  async deleteResource(): Promise<void> {
    throw new Error("The scripted demo never deletes FHIR resources.");
  }
}
