import type {
  Bundle,
  ExtractResource,
  OperationOutcome,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";

import type { FhirBackend } from "./backend";

export type FhirRestBackendOptions = {
  baseUrl: string;
  /**
   * Called for every request so adapters can supply a refreshed bearer token
   * or a backend-specific auth header without leaking that concern into tools.
   */
  getHeaders?: () =>
    | HeadersInit
    | undefined
    | Promise<HeadersInit | undefined>;
  /** Injectable for deterministic adapter contract tests. */
  fetch?: typeof globalThis.fetch;
};

/**
 * FHIR R4 REST transport shared by adapters whose server follows the standard
 * collection search/create/delete paths. It deliberately knows nothing about
 * auth, tenancy, or runtime selection; concrete adapters own those concerns.
 */
export class FhirRestBackend implements FhirBackend {
  private readonly baseUrl: string;
  private readonly getHeaders: NonNullable<FhirRestBackendOptions["getHeaders"]>;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor({ baseUrl, getHeaders, fetch }: FhirRestBackendOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.getHeaders = getHeaders ?? (() => undefined);
    this.fetchFn = fetch ?? globalThis.fetch;
  }

  private async headers(requestHeaders?: HeadersInit): Promise<Headers> {
    const headers = new Headers(await this.getHeaders());
    for (const [key, value] of new Headers(requestHeaders)) {
      headers.set(key, value);
    }
    // Keep the FHIR media type even if an adapter's auth helper returns a
    // generic accept header.
    headers.set("accept", "application/fhir+json");
    return headers;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: await this.headers(init?.headers),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const outcome = JSON.parse(text) as OperationOutcome;
        detail =
          outcome.issue?.[0]?.diagnostics ??
          outcome.issue?.[0]?.details?.text ??
          detail;
      } catch {
        // Non-JSON error body; keep the status code.
      }
      throw new Error(`FHIR request failed: ${detail}`);
    }
    // Deletes and some servers' creates answer 200/204 with an empty body.
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  search<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<Bundle<ExtractResource<K>>> {
    const query =
      params && Object.keys(params).length > 0
        ? `?${new URLSearchParams(params).toString()}`
        : "";
    return this.request<Bundle<ExtractResource<K>>>(
      `/${resourceType}${query}`,
    );
  }

  async searchResources<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<ExtractResource<K>[]> {
    const bundle = await this.search(resourceType, params);
    // A search bundle can carry _include and OperationOutcome entries; only
    // search.mode "match" (or unset, which the spec treats as match in a
    // match-only result) rows are results.
    return (bundle.entry ?? [])
      .filter((entry) => !entry.search?.mode || entry.search.mode === "match")
      .map((entry) => entry.resource)
      .filter((resource): resource is ExtractResource<K> => resource !== undefined);
  }

  async createResource<T extends Resource>(
    resource: T,
  ): Promise<T & { id: string }> {
    const created = await this.request<T & { id: string }>(
      `/${resource.resourceType}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/fhir+json",
          // Without this some servers answer 201 with an empty body; the tools
          // need the server-assigned id back.
          prefer: "return=representation",
        },
        body: JSON.stringify(resource),
      },
    );
    if (!created?.id) {
      throw new Error(
        "FHIR create response did not include a resource id; the adapter requires Prefer: return=representation support.",
      );
    }
    return created;
  }

  async deleteResource(resourceType: ResourceType, id: string): Promise<void> {
    await this.request<unknown>(`/${resourceType}/${id}`, {
      method: "DELETE",
    });
  }
}
