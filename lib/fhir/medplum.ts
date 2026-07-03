import { MedplumClient } from "@medplum/core";
import type {
  Bundle,
  ExtractResource,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";

import type { FhirBackend } from "./backend";

// The Medplum adapter. MedplumClient already speaks the FhirBackend surface,
// so this wrapper only pins down construction (token plus base URL fallback)
// in one place.
export class MedplumBackend implements FhirBackend {
  private readonly medplum: MedplumClient;

  constructor(accessToken: string) {
    // baseUrl lets self-hosters point at their own Medplum; falls back to
    // Medplum's hosted API (api.medplum.com) when unset or empty.
    this.medplum = new MedplumClient({
      accessToken,
      baseUrl: process.env.MEDPLUM_BASE_URL || undefined,
    });
  }

  search<K extends ResourceType>(
    resourceType: K,
    query?: string,
  ): Promise<Bundle<ExtractResource<K>>> {
    return this.medplum.search(resourceType, query);
  }

  searchResources<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<ExtractResource<K>[]> {
    return this.medplum.searchResources(resourceType, params);
  }

  createResource<T extends Resource>(resource: T): Promise<T & { id: string }> {
    return this.medplum.createResource(resource);
  }
}
