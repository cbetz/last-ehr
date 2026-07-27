import type {
  Bundle,
  ExtractResource,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";

import type { FhirWriteClient } from "./write-tools.js";

/**
 * Deliberately duplicated from lib/fhir/rest.ts rather than imported: this is
 * a separately published package that depends only on the MCP SDK and zod.
 * A source-level guard (hapi.test.ts) fails if either fetch here stops
 * revoking both defaults, so the copies cannot drift apart silently.
 *
 * A configured server is trusted to answer FHIR, not to steer this process:
 * refuse redirects rather than letting it point an ordinary search at any
 * host the process can reach, and bound both time and bytes.
 */
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/** Hardening shared by every request; spread last so nothing overrides it. */
const hardened = (): RequestInit => ({
  redirect: "manual",
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});

function refuseRedirect(res: Response): void {
  // Naming the target would put a host in an error string; the status is
  // enough for whoever configured the base URL.
  if (res.status >= 300 && res.status < 400) {
    throw Object.assign(
      new Error(`FHIR request failed: HTTP ${res.status} (redirect refused)`),
      { statusCode: res.status },
    );
  }
}

/** JSON body under a hard ceiling; an unbounded read can exhaust the process. */
async function readCappedJson<T>(res: Response): Promise<T> {
  if (!res.body) return (await res.json()) as T;
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
      throw new Error("FHIR request failed: response body exceeded the size ceiling");
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode()) as T;
}

/**
 * Minimal FHIR R4 REST client for FHIR_BACKEND=hapi — the repository's
 * local, no-auth evaluation stack. It mirrors the web app's shared transport
 * semantics: structured search params only (never raw query strings), the
 * FHIR media type, and match-mode filtering of search bundles. Errors carry
 * the HTTP status only, never response-body diagnostics; the MCP layer
 * additionally replaces every backend error with a generic message before it
 * reaches an MCP host.
 *
 * The name predates the write profile: createResource exists solely for the
 * elicitation-gated proposal tools and is never reachable while the server
 * runs its default read-only policy.
 */
export class HapiReadClient implements FhirWriteClient {
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
      ...hardened(),
    });
    refuseRedirect(res);
    if (!res.ok) {
      throw Object.assign(
        new Error(`FHIR request failed: HTTP ${res.status}`),
        { statusCode: res.status },
      );
    }
    return await readCappedJson<Bundle<ExtractResource<K>>>(res);
  }

  async createResource<T extends Resource>(
    resource: T,
  ): Promise<T & { id: string }> {
    const res = await this.fetchFn(
      `${this.baseUrl}/${resource.resourceType}`,
      {
        method: "POST",
        headers: {
          accept: "application/fhir+json",
          "content-type": "application/fhir+json",
          // Some servers answer 201 with an empty body without this; the
          // proposal result needs the server-assigned id back.
          prefer: "return=representation",
        },
        body: JSON.stringify(resource),
        ...hardened(),
      },
    );
    // Before the Location fallback below: a 3xx carries a Location too, and
    // following it would let a server redirect an approved write off-host.
    refuseRedirect(res);
    if (!res.ok) {
      throw Object.assign(
        new Error(`FHIR request failed: HTTP ${res.status}`),
        { statusCode: res.status },
      );
    }
    // Prefer the returned representation; when a server ignores the Prefer
    // header (2xx with an empty or non-JSON body), fall back to the id in
    // the Location header rather than reporting a completed create as a
    // failure — a retry after that would duplicate an approved write.
    let created: (T & { id?: string }) | undefined;
    try {
      // A cap breach lands in the catch and falls through to the Location
      // header, which is the right outcome here: the write already happened,
      // and retrying it would duplicate an approved write.
      created = await readCappedJson<T & { id?: string }>(res);
    } catch {
      created = undefined;
    }
    if (!created?.id) {
      const location = res.headers.get("location") ?? "";
      const match = location.match(
        new RegExp(`/${resource.resourceType}/([A-Za-z0-9.-]{1,64})`),
      );
      if (match) return { ...resource, id: match[1] };
      throw new Error("FHIR create response did not include a resource id.");
    }
    return created as T & { id: string };
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
