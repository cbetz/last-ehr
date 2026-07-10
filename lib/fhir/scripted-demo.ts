import type {
  Bundle,
  ExtractResource,
  Observation,
  Patient,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";

import type { FhirBackend } from "./backend";
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
    if (
      resource.resourceType !== "Observation" ||
      resource.status !== "final" ||
      resource.code?.text !== "Heart rate" ||
      resource.valueQuantity?.value !== 72 ||
      resource.valueQuantity?.unit !== "bpm" ||
      resource.valueQuantity?.system !== "http://unitsofmeasure.org" ||
      resource.valueQuantity?.code !== "bpm"
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
      code: { text: "Heart rate" },
      subject: { reference: `Patient/${patient.id}` },
      effectiveDateTime: new Date().toISOString(),
      valueQuantity: {
        value: 72,
        unit: "bpm",
        system: "http://unitsofmeasure.org",
        code: "bpm",
      },
      // Recreate the browser session tag instead of accepting arbitrary meta
      // from the tool input, preserving local-demo isolation without widening
      // this wrapper's write surface.
      meta:
        this.sessionId && /^[A-Za-z0-9-]{1,64}$/.test(this.sessionId)
          ? {
              tag: [
                {
                  system: DEMO_TAG_SYSTEM,
                  code: `session-${this.sessionId}`,
                },
              ],
            }
          : undefined,
    });
    return created as unknown as T & { id: string };
  }

  async deleteResource(): Promise<void> {
    throw new Error("The scripted demo never deletes FHIR resources.");
  }
}
