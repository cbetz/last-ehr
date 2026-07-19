/**
 * Minimal FHIR REST probe the harness uses to verify side effects with its
 * own eyes: chart state before and after each scripted decision, never the
 * implementation's word for it. Deliberately tiny and dependency-free —
 * search, create, read, delete — and structured params only.
 */

export type FhirResource = {
  resourceType: string;
  id?: string;
  [key: string]: unknown;
};

export interface FhirProbe {
  searchResources(
    resourceType: string,
    params: Record<string, string>,
  ): Promise<FhirResource[]>;
  createResource(resource: FhirResource): Promise<FhirResource>;
  readResource(resourceType: string, id: string): Promise<FhirResource>;
  deleteResource(resourceType: string, id: string): Promise<void>;
}

/** Bearer auth comes from the environment so tokens never hit argv. */
export function createRestProbe(
  baseUrl: string,
  options: { bearerToken?: string } = {},
): FhirProbe {
  const base = baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "content-type": "application/fhir+json",
    accept: "application/fhir+json",
    ...(options.bearerToken
      ? { authorization: `Bearer ${options.bearerToken}` }
      : {}),
  };

  const request = async (
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      // A hung store must fail the run, not hang it (and not silently
      // race the MCP call timeout mid-check).
      signal: AbortSignal.timeout(30_000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      // Status only: probe errors surface to the operator's terminal, and
      // FHIR OperationOutcome bodies can carry resource details.
      throw new Error(`FHIR probe ${method} failed with HTTP ${response.status}`);
    }
    if (method === "DELETE") return undefined;
    return response.json();
  };

  return {
    async searchResources(resourceType, params) {
      const query = new URLSearchParams(params).toString();
      const bundle = (await request(
        "GET",
        `/${resourceType}?${query}`,
      )) as { entry?: Array<{ resource?: FhirResource }> };
      return (bundle.entry ?? [])
        .map((entry) => entry.resource)
        .filter((resource): resource is FhirResource => Boolean(resource));
    },
    async createResource(resource) {
      return (await request(
        "POST",
        `/${resource.resourceType}`,
        resource,
      )) as FhirResource;
    },
    async readResource(resourceType, id) {
      return (await request(
        "GET",
        `/${resourceType}/${encodeURIComponent(id)}`,
      )) as FhirResource;
    },
    async deleteResource(resourceType, id) {
      await request("DELETE", `/${resourceType}/${encodeURIComponent(id)}`);
    },
  };
}
