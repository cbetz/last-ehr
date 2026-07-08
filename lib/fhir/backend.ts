import type {
  Bundle,
  ExtractResource,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";

import { MedplumBackend } from "./medplum";
import { HapiBackend } from "./hapi";

// The FHIR surface the agent tools require of a backend. Implementations:
// Medplum (./medplum.ts) and HAPI or any open FHIR R4 server (./hapi.ts).
// Aidbox and Oystehr adapters are tracked in issues #39 and #40.
//
// Contract notes for adapter authors:
// - searchResources must hit the server's search path, never a direct read by
//   id. Compartment-scoped access policies (for example SMART launch scopes)
//   may only be enforced on search, so the tools fetch even a single known
//   resource with a search (_id=<id>).
// - createResource must persist meta.tag as given; the public demo relies on
//   it for per-session write isolation.
// - search takes STRUCTURED params, never a raw query string, so
//   user-supplied values (a patient name with & or =) cannot cross the
//   query-language boundary and become extra search parameters.
export interface FhirBackend {
  /** Search returning the raw bundle, e.g. search("Patient", { name: "smith" }). */
  search<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<Bundle<ExtractResource<K>>>;
  /** Search returning just the matching resources. */
  searchResources<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<ExtractResource<K>[]>;
  /** Create a resource, returning it with its server-assigned id. */
  createResource<T extends Resource>(resource: T): Promise<T & { id: string }>;
  /**
   * Delete a resource by id. For seeding and admin tooling only; this is
   * never wired into an agent tool.
   */
  deleteResource(resourceType: ResourceType, id: string): Promise<void>;
}

// The chat route resolves its backend here. FHIR_BACKEND selects the adapter:
// "medplum" (default; hosted or self-hosted Medplum, token-authenticated) or
// "hapi" (any open FHIR R4 server named by FHIR_BASE_URL; local single-tenant
// use, see the self-host docs).
export function createFhirBackend(accessToken: string): FhirBackend {
  const backend = process.env.FHIR_BACKEND || "medplum";
  if (backend === "hapi") {
    const baseUrl = process.env.FHIR_BASE_URL;
    if (!baseUrl) {
      throw new Error(
        "FHIR_BACKEND=hapi requires FHIR_BASE_URL (for example http://localhost:8080/fhir).",
      );
    }
    return new HapiBackend(baseUrl);
  }
  if (backend !== "medplum") {
    throw new Error(
      `Unknown FHIR_BACKEND "${backend}". Supported values: medplum, hapi.`,
    );
  }
  return new MedplumBackend(accessToken);
}
