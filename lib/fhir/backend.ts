import type {
  Bundle,
  ExtractResource,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";

import { MedplumBackend } from "./medplum";
import { HapiBackend } from "./hapi";
import { FirelyBackend } from "./firely";
import { AidboxBackend } from "./aidbox";

// The FHIR surface the agent tools require of a backend. Built-in
// implementations are Medplum (./medplum.ts) and the local HAPI FHIR
// evaluation transport (./hapi.ts). Other servers need their own verified
// adapter/auth story; FhirRestBackend is the reusable standard-REST base.
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

/**
 * Whether a backend name's required server env is present, in the context the
 * demo picker runs in (quickstart sessions). The chat route uses this to make
 * an allowlisted-but-misconfigured pick degrade exactly like an unlisted one
 * (silent fallback to the deployment default) instead of a bare 500 from the
 * factory throw. "medplum" requires the quickstart client credentials because
 * a picked-Medplum demo session is only usable with a real minted token.
 */
export function hasFhirBackendConfig(name: string): boolean {
  // Deliberately stricter than the factory: the shared FHIR_BASE_URL counts
  // only when the name IS the deployment default. Otherwise an allowlisted
  // non-default pick could ride the fallback onto another backend's server
  // through the wrong transport (e.g. a credential-less hapi pick aimed at
  // the default Firely server's URL). A non-default pick must name its own
  // per-backend base URL; failing this check degrades to silent fallback.
  const isDefault = (process.env.FHIR_BACKEND || "medplum") === name;
  const sharedUrl = isDefault ? process.env.FHIR_BASE_URL : undefined;
  switch (name) {
    case "medplum":
      return Boolean(
        process.env.MEDPLUM_CLIENT_ID && process.env.MEDPLUM_CLIENT_SECRET,
      );
    case "hapi":
      return Boolean(process.env.HAPI_BASE_URL || sharedUrl);
    case "firely":
      return Boolean(process.env.FIRELY_BASE_URL || sharedUrl);
    case "aidbox":
      return Boolean(
        (process.env.AIDBOX_BASE_URL || sharedUrl) &&
          process.env.AIDBOX_CLIENT_ID &&
          process.env.AIDBOX_CLIENT_SECRET,
      );
    default:
      return false;
  }
}

// The chat route resolves its backend here. The adapter is selected by the
// optional backendName argument, falling back to FHIR_BACKEND:
// "medplum" (default; hosted or self-hosted Medplum, token-authenticated),
// "hapi" (the included local, no-auth HAPI FHIR evaluation stack), "firely"
// (a Firely Server, anonymous or with a static bearer token in
// FIRELY_ACCESS_TOKEN), or "aidbox" (an Aidbox box's /fhir endpoint with a
// basic-auth Client in AIDBOX_CLIENT_ID/AIDBOX_CLIENT_SECRET). Each REST
// adapter reads its own base URL (HAPI_BASE_URL, FIRELY_BASE_URL,
// AIDBOX_BASE_URL) so several backends can be configured at once, falling
// back to the shared FHIR_BASE_URL for existing single-backend deployments.
// Firely and Aidbox are synthetic evaluation only; see the self-host docs
// and docs/support.md for each tier's limits.
export function createFhirBackend(
  accessToken: string,
  backendName?: string,
): FhirBackend {
  const backend = backendName || process.env.FHIR_BACKEND || "medplum";
  if (backend === "hapi") {
    const baseUrl = process.env.HAPI_BASE_URL || process.env.FHIR_BASE_URL;
    if (!baseUrl) {
      throw new Error(
        "FHIR_BACKEND=hapi requires HAPI_BASE_URL or FHIR_BASE_URL (for example http://localhost:8080/fhir).",
      );
    }
    return new HapiBackend(baseUrl);
  }
  if (backend === "firely") {
    const baseUrl = process.env.FIRELY_BASE_URL || process.env.FHIR_BASE_URL;
    if (!baseUrl) {
      throw new Error(
        "FHIR_BACKEND=firely requires FIRELY_BASE_URL or FHIR_BASE_URL (for example https://server.fire.ly).",
      );
    }
    return new FirelyBackend(
      baseUrl,
      process.env.FIRELY_ACCESS_TOKEN || undefined,
    );
  }
  if (backend === "aidbox") {
    const baseUrl = process.env.AIDBOX_BASE_URL || process.env.FHIR_BASE_URL;
    const clientId = process.env.AIDBOX_CLIENT_ID;
    const clientSecret = process.env.AIDBOX_CLIENT_SECRET;
    if (!baseUrl || !clientId || !clientSecret) {
      throw new Error(
        "FHIR_BACKEND=aidbox requires AIDBOX_BASE_URL or FHIR_BASE_URL (the box's /fhir endpoint, for example http://localhost:8888/fhir) plus AIDBOX_CLIENT_ID and AIDBOX_CLIENT_SECRET.",
      );
    }
    return new AidboxBackend(baseUrl, clientId, clientSecret);
  }
  if (backend !== "medplum") {
    throw new Error(
      `Unknown FHIR_BACKEND "${backend}". Supported values: medplum, hapi, firely, aidbox.`,
    );
  }
  return new MedplumBackend(accessToken);
}
