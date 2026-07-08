import type {
  Bundle,
  ExtractResource,
  OperationOutcome,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";

import type { FhirBackend } from "./backend";

// Plain FHIR R4 REST adapter for HAPI, or any open FHIR server reachable at
// FHIR_BASE_URL. It sends no credentials: HAPI's JPA starter ships with no
// auth, and the self-host docs pin this mode to local, single-tenant use.
// The shared public demo stays on the Medplum adapter.
export class HapiBackend implements FhirBackend {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/fhir+json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    if (!res.ok) {
      // Surface the server's OperationOutcome diagnostics when present; the
      // chat route truncates and relays tool errors to the user.
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
      .filter((e) => !e.search?.mode || e.search.mode === "match")
      .map((e) => e.resource)
      .filter((r): r is ExtractResource<K> => r !== undefined);
  }

  createResource<T extends Resource>(resource: T): Promise<T & { id: string }> {
    return this.request<T & { id: string }>(`/${resource.resourceType}`, {
      method: "POST",
      headers: {
        "content-type": "application/fhir+json",
        // Without this HAPI may answer 201 with an empty body; the tools
        // need the server-assigned id back.
        prefer: "return=representation",
      },
      body: JSON.stringify(resource),
    });
  }

  async deleteResource(resourceType: ResourceType, id: string): Promise<void> {
    await this.request<unknown>(`/${resourceType}/${id}`, {
      method: "DELETE",
    });
  }
}
