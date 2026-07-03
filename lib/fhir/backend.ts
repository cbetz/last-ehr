import type {
  Bundle,
  ExtractResource,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";

import { MedplumBackend } from "./medplum";

// The FHIR surface the agent tools require of a backend. Medplum is the only
// implementation today (./medplum.ts); Aidbox, Oystehr, and HAPI adapters are
// tracked in issues #39, #40, and #44.
//
// Contract notes for adapter authors:
// - searchResources must hit the server's search path, never a direct read by
//   id. Compartment-scoped access policies (for example SMART launch scopes)
//   may only be enforced on search, so the tools fetch even a single known
//   resource with a search (_id=<id>).
// - createResource must persist meta.tag as given; the public demo relies on
//   it for per-session write isolation.
export interface FhirBackend {
  /** Search returning the raw bundle, e.g. search("Patient", "name=smith"). */
  search<K extends ResourceType>(
    resourceType: K,
    query?: string,
  ): Promise<Bundle<ExtractResource<K>>>;
  /** Search returning just the matching resources. */
  searchResources<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<ExtractResource<K>[]>;
  /** Create a resource, returning it with its server-assigned id. */
  createResource<T extends Resource>(resource: T): Promise<T & { id: string }>;
}

// The chat route resolves its backend here. With a single adapter there is
// nothing to select yet; this is the one call site to touch when a second
// adapter lands.
export function createFhirBackend(accessToken: string): FhirBackend {
  return new MedplumBackend(accessToken);
}
