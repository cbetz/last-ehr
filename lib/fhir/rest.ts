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
 * A configured FHIR server is trusted to answer FHIR, not to control this
 * process. Node's bare `fetch` defaults grant it three powers it should not
 * have, so every request below revokes them; see the comments at each use.
 */
const REQUEST_TIMEOUT_MS = 30_000;
/**
 * Two orders of magnitude above any chart response this transport asks for
 * (`_count` is capped at 200 and no adapter fetches attachment bodies), and
 * far below what would exhaust the process.
 */
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/**
 * Buffer a body under a hard ceiling. An unbounded read lets a server stream
 * until the process dies, and a `content-length` precheck does not help: a
 * chunked response carries no such header.
 */
async function readCappedText(res: Response): Promise<string> {
  // Adapters' wire-level test doubles resolve text() without a real stream.
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(
        `FHIR request failed: response body exceeded the ${MAX_RESPONSE_BYTES}-byte ceiling`,
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

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
      // Applied AFTER the spread: no caller can opt out of either limit.
      //
      // Refuse redirects instead of following them. This URL is the only one
      // the transport ever builds — base URL plus a path derived from a
      // ResourceType union — but Node's default is "follow", so a configured
      // server (or anything that can compromise or impersonate one) can 302
      // an ORDINARY search to any host this process can reach, and the body
      // it answers with enters the chart as if the FHIR server had returned
      // it. Cross-origin redirects do drop `authorization`, but not custom
      // auth headers, and nothing protects the response direction at all.
      redirect: "manual",
      // Without a signal a trickling body holds the request open forever.
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // "manual" surfaces the 3xx rather than following it. Naming the target
    // would put a host in an error string, so the status has to carry it:
    // whoever configured the base URL can read the Location themselves.
    if (res.status >= 300 && res.status < 400) {
      throw Object.assign(
        new Error(
          `FHIR request failed: server answered HTTP ${res.status} with a redirect, which is refused; configure the base URL as the final location`,
        ),
        { statusCode: res.status },
      );
    }
    const text = await readCappedText(res);
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
      // statusCode rides along for structured consumers: the log scrubber
      // (lib/ai/chat-errors.ts) appends it to server logs, and the dev-output
      // observer surfaces it as a bare number without the diagnostic text.
      throw Object.assign(new Error(`FHIR request failed: ${detail}`), {
        statusCode: res.status,
      });
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
