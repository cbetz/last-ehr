import type { SandboxConfig } from "./sandbox-config.js";
import {
  assertPrivateKeyLoads,
  createSandboxTokenSource,
  safeScopeList,
} from "./sandbox-auth.js";

export type SandboxDoctorReport = {
  ok: boolean;
  lines: string[];
};

const MAX_JWKS_BYTES = 64 * 1024;
const PATIENT_ID = /^[A-Za-z0-9\-.]{1,128}$/;

async function readLimited(response: Response): Promise<string> {
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    total += value.byteLength;
    if (total > MAX_JWKS_BYTES) {
      await reader.cancel();
      throw new Error("limit");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Config check for a SMART sandbox backend. Contacts the token endpoint
 * and, when set, the JWKS URL. Never includes a key, assertion, or token
 * in the lines it returns.
 */
export async function runSandboxDoctor(
  config: SandboxConfig,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<SandboxDoctorReport> {
  const lines: string[] = [];
  let ok = true;

  if (config.privateKeyPem) {
    try {
      await assertPrivateKeyLoads(config.privateKeyPem);
      lines.push("Private key loaded (PKCS#8, RS384).");
    } catch {
      lines.push("Private key could not be parsed. Expected a PKCS#8 PEM for RS384.");
      return { ok: false, lines };
    }
  } else if (config.accessToken) {
    lines.push("A pre-minted access token is configured. The token was not printed.");
  }

  if (!config.jwksUrl || !config.keyId) {
    lines.push(
      config.jwksUrl
        ? "LASTEHR_KEY_ID is not set, so the JWKS kid was not checked."
        : "LASTEHR_JWKS_URL is not set, so the JWKS kid was not checked.",
    );
  } else {
    try {
      const response = await fetchFn(config.jwksUrl, {
        headers: { accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status >= 300 && response.status < 400) {
        lines.push("JWKS request was a redirect and was refused.");
        ok = false;
      } else if (!response.ok) {
        lines.push(`JWKS request failed (HTTP ${response.status}).`);
        ok = false;
      } else {
        const text = await readLimited(response);
        const parsed = JSON.parse(text) as {
          keys?: Array<Record<string, unknown>>;
        };
        const keys = Array.isArray(parsed.keys) ? parsed.keys : [];
        if (keys.some((key) => "d" in key || "p" in key || "q" in key)) {
          lines.push("JWKS document contains private key material and was not accepted.");
          ok = false;
        } else if (
          keys.some(
            (key) => key.kid === config.keyId && key.kty === "RSA" && !("d" in key),
          )
        ) {
          lines.push("JWKS kid matches.");
        } else {
          lines.push("JWKS does not include the configured kid.");
          ok = false;
        }
      }
    } catch {
      lines.push("JWKS request failed. The document was not printed.");
      ok = false;
    }
  }

  let bearer = config.accessToken;
  if (!bearer && config.clientId && config.privateKeyPem) {
    try {
      const minted = await createSandboxTokenSource({
        clientId: config.clientId,
        privateKeyPem: config.privateKeyPem,
        keyId: config.keyId,
        scopes: config.scopes,
        tokenUrl: config.tokenUrl,
        fetch: fetchFn,
      })();
      bearer = minted.accessToken;
      const scopes = safeScopeList(minted.scope);
      lines.push(
        scopes
          ? `Token exchange succeeded. Granted scopes: ${scopes}.`
          : "Token exchange succeeded. The token response did not include a recognizable scope list.",
      );
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "statusCode" in error
          ? (error as { statusCode: unknown }).statusCode
          : undefined;
      lines.push(
        typeof status === "number"
          ? `Token request failed (HTTP ${status}).`
          : "Token request failed. No credential was printed.",
      );
      return { ok: false, lines };
    }
  }

  if (!bearer) {
    lines.push("No access token was available. No search was attempted.");
    return { ok: false, lines };
  }

  try {
    const requestedId = config.patientId?.trim();
    const patientId =
      requestedId && PATIENT_ID.test(requestedId) ? requestedId : undefined;
    if (requestedId && !patientId) {
      lines.push(
        "LASTEHR_PATIENT_ID is not a FHIR-style id, so it was not placed on the search.",
      );
      ok = false;
    }
    const url = new URL("Patient", `${config.baseUrl.replace(/\/+$/, "")}/`);
    // Cerner rejects Patient?_count=1 (HTTP 400) unless a parameter such as
    // _id is present, and rejects _count when _id is also set. Search by id
    // alone when the operator supplied one.
    if (patientId) url.searchParams.set("_id", patientId);
    else url.searchParams.set("_count", "1");
    const response = await fetchFn(url, {
      headers: {
        accept: "application/fhir+json",
        authorization: `Bearer ${bearer}`,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    await response.body?.cancel().catch(() => {});
    if (response.status === 403) {
      lines.push(
        "Search was refused (HTTP 403). This app lacks the search scope. A direct read of a known id can still succeed.",
      );
    } else if (response.status === 400 && !patientId) {
      lines.push(
        "Patient search without an id was refused (HTTP 400). This server requires a parameter such as _id. Set LASTEHR_PATIENT_ID to probe that search. No patient data was printed.",
      );
    } else if (response.status >= 300 && response.status < 400) {
      lines.push("Patient search was a redirect and was refused.");
      ok = false;
    } else if (response.ok) {
      lines.push(
        patientId
          ? "Patient search by id is allowed. No patient data was printed."
          : "Patient search is allowed. No patient data was printed.",
      );
    } else {
      lines.push(`Patient search failed (HTTP ${response.status}). No patient data was printed.`);
      ok = false;
    }
  } catch {
    lines.push("Patient search failed. No patient data was printed.");
    ok = false;
  }

  lines.push("No chart write was attempted.");
  return { ok, lines };
}
