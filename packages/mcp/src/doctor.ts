import type { McpRuntimeConfig } from "./config.js";
import { HapiReadClient } from "./hapi.js";
import { createMedplumClient } from "./medplum.js";

const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const COUNT_QUERY = { _summary: "count", _count: "0" };

export type DoctorReport = {
  ok: boolean;
  /** Only static diagnostics: no endpoints, resource data, counts, or errors. */
  lines: string[];
};

type DoctorOptions = {
  connect?: boolean;
  fetchFn?: typeof globalThis.fetch;
  /** Injectable only for tests/embedders; the CLI always uses ten seconds. */
  timeoutMs?: number;
};

class ProbeFailure extends Error {}

function configurationSummary(config: McpRuntimeConfig): string {
  const auth =
    config.backend === "hapi"
      ? "local no-auth HAPI"
      : config.transport === "http"
        ? "per-caller OAuth (token exchange)"
        : config.accessToken
          ? "access token"
          : "client credentials";
  const writes =
    config.writePolicy === "proposal" ? "proposal-gated writes" : "read-only";
  return `Last EHR MCP configuration is valid (${config.backend}; ${auth}; ${writes}).`;
}

const UNCHECKED =
  "Not checked: other resource permissions, write permissions, MCP host initialization, or host approval/elicitation support.";
const REMOTE_UNCHECKED =
  "Remote OAuth login, per-caller token exchange, FHIR permissions, and MCP client approval/elicitation support remain unverified.";

/** Reject URL components that could carry credentials or alter the probe path. */
function probeBase(config: McpRuntimeConfig): URL {
  const url = new URL(config.baseUrl ?? "https://api.medplum.com/");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash
  ) {
    throw new ProbeFailure(
      "Connection check refused: the backend base URL must use HTTP(S) without credentials, query parameters, or a fragment.",
    );
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

function withAbort<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new ProbeFailure("Connection check timed out."));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

/**
 * This fetch is confined to the two probes and existing Medplum login paths.
 * It never follows a backend-selected URL and never permits a FHIR write.
 * Materializing a capped body here also bounds SDK JSON parsing and auth.
 */
function probeFetch(
  config: McpRuntimeConfig,
  base: URL,
  signal: AbortSignal,
  fetchFn: typeof globalThis.fetch,
): typeof globalThis.fetch {
  const fhir = new URL(config.backend === "hapi" ? "./" : "fhir/R4/", base);
  const metadata = new URL("metadata", fhir);
  const patients = new URL("Patient", fhir);
  const token = new URL("oauth2/token", base);
  const profile = new URL("auth/me", base);

  return async (input, init) => {
    if (signal.aborted) {
      throw new DOMException("Connection check stopped.", "AbortError");
    }
    const requestUrl = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const patientProbe =
      requestUrl.origin === patients.origin &&
      requestUrl.pathname === patients.pathname &&
      requestUrl.searchParams.size === 2 &&
      requestUrl.searchParams.get("_summary") === "count" &&
      requestUrl.searchParams.get("_count") === "0" &&
      !requestUrl.hash;
    const allowed =
      (method === "GET" && (requestUrl.href === metadata.href || patientProbe)) ||
      (config.backend === "medplum" && method === "GET" && requestUrl.href === profile.href) ||
      (config.backend === "medplum" && !config.accessToken && method === "POST" && requestUrl.href === token.href);
    if (!allowed) {
      throw new ProbeFailure("Connection check refused an unexpected request.");
    }

    const response = await withAbort(fetchFn(input, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.any([
        signal,
        ...(init?.signal ? [init.signal] : []),
        ...(input instanceof Request ? [input.signal] : []),
      ]),
    }), signal);
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new ProbeFailure(
        response.status >= 300 && response.status < 400
          ? "Connection check refused a redirect."
          : `Connection request failed (HTTP ${response.status}). Check credentials, backend availability, and access policy.`,
      );
    }
    if (!response.body) {
      throw new ProbeFailure("Connection response was not valid JSON; backend diagnostics were withheld.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await withAbort(reader.read(), signal);
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          throw new ProbeFailure("Connection response exceeded the diagnostic size limit.");
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      // Medplum's parseBody logs JSON.parse errors, whose message can quote
      // the response body. Validate here, before either SDK login or FHIR
      // parsing can observe an untrusted malformed body. Never retain or
      // rethrow the parser's error.
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new ProbeFailure("Connection response was not valid JSON; backend diagnostics were withheld.");
      }
      if (
        !isObject(parsed) || Array.isArray(parsed) ||
        parsed.resourceType === "OperationOutcome"
      ) {
        throw new ProbeFailure("Connection response was not the expected JSON object; backend diagnostics were withheld.");
      }
      return new Response(text, {
        status: response.status,
        headers: response.headers,
      });
    } catch (error) {
      void reader.cancel().catch(() => {});
      throw error;
    }
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export async function runDoctor(
  config: McpRuntimeConfig,
  options: DoctorOptions = {},
): Promise<DoctorReport> {
  const lines = [configurationSummary(config)];
  if (config.transport === "http") {
    if (options.connect) {
      lines.push("Live checks are not supported for HTTP transport. No network request was made.");
    } else {
      lines.push("Configuration only; no network request was made.");
    }
    lines.push(REMOTE_UNCHECKED);
    return { ok: !options.connect, lines };
  }
  if (!options.connect) {
    lines.push("No connection attempted. Run doctor --connect to check FHIR metadata and a count-only Patient search.", UNCHECKED);
    return { ok: true, lines };
  }

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), options.timeoutMs ?? TIMEOUT_MS);
  try {
    const base = probeBase(config);
    const boundedFetch = probeFetch(config, base, abort.signal, options.fetchFn ?? fetch);
    const check = async () => {
      let metadata: unknown;
      let search: () => PromiseLike<unknown>;
      if (config.backend === "hapi") {
        const client = new HapiReadClient(base.href, boundedFetch);
        const response = await boundedFetch(new URL("metadata", base), {
          headers: { accept: "application/fhir+json" },
        });
        metadata = await response.json();
        search = () => client.search("Patient", COUNT_QUERY);
      } else {
        const client = await createMedplumClient(config, boundedFetch);
        if (!client.getAccessToken()) {
          throw new ProbeFailure("Medplum authentication did not provide an access token.");
        }
        metadata = await client.get(client.fhirUrl("metadata"), { maxRetries: 0 });
        search = () => client.search("Patient", COUNT_QUERY, { maxRetries: 0 });
      }
      if (
        !isObject(metadata) || metadata.resourceType !== "CapabilityStatement" ||
        typeof metadata.fhirVersion !== "string" || !metadata.fhirVersion.startsWith("4.0.")
      ) {
        throw new ProbeFailure("The metadata response was not a FHIR R4 CapabilityStatement.");
      }
      lines.push("FHIR R4 metadata: reachable.");
      const result = await search();
      if (
        !isObject(result) || result.resourceType !== "Bundle" || result.type !== "searchset" ||
        (result.entry !== undefined && (!Array.isArray(result.entry) || result.entry.length > 0))
      ) {
        throw new ProbeFailure("The Patient search did not return a count-only search bundle. No response content was printed.");
      }
      lines.push("Count-only Patient search: accepted with no resource entries. This checks only that search request, not access to individual charts.");
    };
    await withAbort(check(), abort.signal);
    lines.push("No chart write was attempted. No patient data or counts were printed.", UNCHECKED);
    return { ok: true, lines };
  } catch (error) {
    lines.push(abort.signal.aborted
      ? "Connection check timed out."
      : error instanceof ProbeFailure
        ? error.message
        : "Connection check failed. Verify credentials, backend availability, and access policy; backend diagnostics were withheld.");
    lines.push("No chart write was attempted.", UNCHECKED);
    return { ok: false, lines };
  } finally {
    clearTimeout(timeout);
    abort.abort();
  }
}
