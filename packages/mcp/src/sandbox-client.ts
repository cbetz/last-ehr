import type {
  Bundle,
  ExtractResource,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";

import type { SandboxConfig } from "./sandbox-config.js";
import { createSandboxTokenSource } from "./sandbox-auth.js";
import type { FhirWriteClient } from "./write-tools.js";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const RESOURCE_ID = /^[A-Za-z0-9\-.]{1,128}$/;

export class SandboxPublicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxPublicError";
  }
}

export const SEARCH_SCOPE_MESSAGE =
  "Search was refused (HTTP 403). This app lacks the search scope. A direct read of a known id can still succeed.";

function resourceIdFromLocation(location: string, resourceType: string): string | undefined {
  const match = location
    .trim()
    .match(new RegExp(`(?:^|/)${resourceType}/([A-Za-z0-9\\-.]{1,128})(?:$|[/?#])`));
  const id = match?.[1];
  return id && RESOURCE_ID.test(id) ? id : undefined;
}

async function readCappedText(res: Response): Promise<string> {
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
      throw new Error("FHIR response exceeded the size limit.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * FHIR client for Epic, Oracle Health, or a generic SMART Backend Services
 * server. Writes use application/fhir+json. Epic's empty 201 body is read
 * from Location. Search HTTP 403 becomes a static missing-scope error.
 */
export function createSandboxClient(
  config: SandboxConfig,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): FhirWriteClient {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const token = config.accessToken
    ? async () => config.accessToken as string
    : async () => {
        if (!config.clientId || !config.privateKeyPem) {
          throw new SandboxPublicError(
            "SMART credentials are incomplete. No secret was logged.",
          );
        }
        const minted = await createSandboxTokenSource({
          clientId: config.clientId,
          privateKeyPem: config.privateKeyPem,
          keyId: config.keyId,
          scopes: config.scopes,
          tokenUrl: config.tokenUrl,
          fetch: fetchFn,
        })();
        return minted.accessToken;
      };

  const request = async (
    path: string,
    init?: RequestInit,
  ): Promise<{ text: string; location: string; status: number }> => {
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${await token()}`);
    headers.set("accept", "application/fhir+json");
    const response = await fetchFn(`${baseUrl}${path}`, {
      ...init,
      headers,
      redirect: "manual",
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      throw Object.assign(
        new Error(`FHIR request failed: HTTP ${response.status} (redirect refused)`),
        { statusCode: response.status },
      );
    }
    const text = await readCappedText(response);
    if (!response.ok) {
      throw Object.assign(new Error(`FHIR request failed: HTTP ${response.status}`), {
        statusCode: response.status,
      });
    }
    return {
      text,
      location: response.headers.get("location") ?? "",
      status: response.status,
    };
  };

  const searchParams = (params?: Record<string, string>) => {
    if (!params) return params;
    if (config.profile === "oracle" && params._id && params._count) {
      const rest = { ...params };
      delete rest._count;
      return rest;
    }
    return params;
  };

  return {
    async search(resourceType, params) {
      const adjusted = searchParams(params);
      const query =
        adjusted && Object.keys(adjusted).length > 0
          ? `?${new URLSearchParams(adjusted).toString()}`
          : "";
      try {
        const { text } = await request(`/${resourceType}${query}`);
        return JSON.parse(text) as Bundle<ExtractResource<typeof resourceType>>;
      } catch (error) {
        const status =
          typeof error === "object" && error !== null && "statusCode" in error
            ? (error as { statusCode: unknown }).statusCode
            : undefined;
        if (
          status === 403 &&
          error instanceof Error &&
          error.message.startsWith("FHIR request failed")
        ) {
          throw new SandboxPublicError(SEARCH_SCOPE_MESSAGE);
        }
        throw error;
      }
    },
    async searchResources(resourceType, params) {
      const bundle = await this.search(resourceType, params);
      return (bundle.entry ?? [])
        .filter((entry) => !entry.search?.mode || entry.search.mode === "match")
        .map((entry) => entry.resource)
        .filter((resource): resource is ExtractResource<typeof resourceType> => resource !== undefined);
    },
    async createResource(resource) {
      const { text, location } = await request(`/${resource.resourceType}`, {
        method: "POST",
        headers: { "content-type": "application/fhir+json" },
        body: JSON.stringify(resource),
      });
      if (text) {
        const parsed = JSON.parse(text) as Resource & { id?: string };
        if (parsed.id) return parsed as typeof resource & { id: string };
      }
      const id = resourceIdFromLocation(location, resource.resourceType);
      if (id) return { ...resource, id };
      throw new SandboxPublicError(
        "FHIR create response did not include a resource id.",
      );
    },
    async readResource(resourceType, id) {
      if (!RESOURCE_ID.test(id)) {
        throw new SandboxPublicError("FHIR read refused: the resource id is not a safe id.");
      }
      const { text } = await request(`/${resourceType}/${encodeURIComponent(id)}`);
      const parsed = text ? (JSON.parse(text) as ExtractResource<typeof resourceType>) : undefined;
      if (!parsed || parsed.resourceType !== resourceType) {
        throw new SandboxPublicError("FHIR read did not return the requested resource.");
      }
      return parsed;
    },
  };
}
