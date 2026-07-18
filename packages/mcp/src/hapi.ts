import type {
  Bundle,
  ExtractResource,
  ResourceType,
} from "@medplum/fhirtypes";

import type { FhirReadClient } from "./read-tools.js";

/**
 * Minimal read-only FHIR R4 REST client for FHIR_BACKEND=hapi — the
 * repository's local, no-auth evaluation stack. It mirrors the web app's
 * shared transport semantics: structured search params only (never raw query
 * strings), the FHIR media type, and match-mode filtering of search bundles.
 * Errors carry the HTTP status only, never response-body diagnostics; the
 * MCP layer additionally replaces every backend error with a generic message
 * before it reaches an MCP host.
 */
export class HapiReadClient implements FhirReadClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(baseUrl: string, fetchFn: typeof globalThis.fetch = fetch) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchFn = fetchFn;
  }

  async search<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<Bundle<ExtractResource<K>>> {
    const query =
      params && Object.keys(params).length > 0
        ? `?${new URLSearchParams(params).toString()}`
        : "";
    const res = await this.fetchFn(`${this.baseUrl}/${resourceType}${query}`, {
      headers: { accept: "application/fhir+json" },
    });
    if (!res.ok) {
      throw Object.assign(
        new Error(`FHIR request failed: HTTP ${res.status}`),
        { statusCode: res.status },
      );
    }
    return (await res.json()) as Bundle<ExtractResource<K>>;
  }

  async searchResources<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<ExtractResource<K>[]> {
    const bundle = await this.search(resourceType, params);
    // Only search-mode "match" rows (or unset, treated as match) are
    // results; bundles can carry _include and OperationOutcome entries.
    return (bundle.entry ?? [])
      .filter((entry) => !entry.search?.mode || entry.search.mode === "match")
      .map((entry) => entry.resource)
      .filter(
        (resource): resource is ExtractResource<K> => resource !== undefined,
      );
  }
}
