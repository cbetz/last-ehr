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
// in one place. Callers that manage their own client lifecycle (for example
// the MCP server's client-credentials login) pass the client in directly.
export class MedplumBackend implements FhirBackend {
  private readonly medplum: MedplumClient;

  constructor(auth: string | MedplumClient) {
    // baseUrl lets self-hosters point at their own Medplum; falls back to
    // Medplum's hosted API (api.medplum.com) when unset or empty.
    this.medplum =
      typeof auth === "string"
        ? new MedplumClient({
            accessToken: auth,
            baseUrl: process.env.MEDPLUM_BASE_URL || undefined,
          })
        : auth;
  }

  search<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<Bundle<ExtractResource<K>>> {
    return this.medplum.search(resourceType, params);
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

  async deleteResource(resourceType: ResourceType, id: string): Promise<void> {
    await this.medplum.deleteResource(resourceType, id);
  }
}
