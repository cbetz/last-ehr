import { FhirRestBackend } from "./rest";

// Oystehr (oystehr.com, formerly ZapEHR) adapter over the shared REST
// transport. Oystehr is SaaS-only, so the endpoints default to the official
// hosted API; the FHIR base serves R4B at the /r4 path. Three things worth
// knowing against Oystehr:
//
// - The first supported auth mode is an M2M client's OAuth2 client
//   credentials: a JSON (not form-encoded) POST to the token endpoint with
//   audience https://api.zapehr.com, yielding a 24-hour JWT. The adapter
//   mints lazily, caches until shortly before the token's exp claim, and
//   single-flights concurrent mints (a chart view fires several parallel
//   searches). A pre-minted token can be passed instead (accessToken), which
//   skips the flow entirely.
// - The project is bound to the M2M client via a JWT claim, so no project
//   header is strictly required; when OYSTEHR_PROJECT_ID is configured the
//   adapter sends x-oystehr-project-id anyway, matching the official docs'
//   own FHIR examples.
// - Scope the M2M client with an Oystehr access policy (FHIR:Search/Read/
//   Create at minimum; the seed and contract harness also delete). Access
//   control and tenancy stay Oystehr's job, per the adapter contract.
//
// Registered as FHIR_BACKEND=oystehr. Until a maintainer-run verification
// (real-server contract + FHIR Agent Safety Eval) lands against a disposable
// sandbox project, treat it as unverified; see docs/support.md.

export const OYSTEHR_FHIR_BASE_URL = "https://fhir-api.zapehr.com/r4";
export const OYSTEHR_TOKEN_URL = "https://auth.zapehr.com/oauth/token";
const OYSTEHR_TOKEN_AUDIENCE = "https://api.zapehr.com";

// Refresh a minute early so a token about to expire is never used; if the
// JWT carries no readable exp claim, re-mint hourly (documented lifetime is
// 24h, so the fallback is deliberately much shorter than reality).
const EXPIRY_MARGIN_MS = 60_000;
const FALLBACK_TTL_MS = 60 * 60 * 1000;

/** Milliseconds until a JWT expires, from its exp claim; undefined if unreadable. */
function tokenTtlMs(token: string): number | undefined {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    // isFinite also rejects JSON exponents that parse to Infinity, which
    // would otherwise cache a token forever.
    if (typeof decoded.exp === "number" && Number.isFinite(decoded.exp)) {
      return Math.max(0, decoded.exp * 1000 - Date.now());
    }
  } catch {
    // Fall through to the fallback TTL.
  }
  return undefined;
}

/**
 * Lazily minted, cached, single-flighted client-credentials token source.
 * Standalone (not a class member) so the getHeaders closure can capture it
 * before the transport constructor runs.
 */
function createTokenSource(
  clientId: string,
  clientSecret: string,
  tokenUrl: string,
  fetchFn: typeof globalThis.fetch,
): () => Promise<string> {
  let cached: { value: string; expiresAt: number } | undefined;
  let minting: Promise<string> | undefined;

  const mint = async (): Promise<string> => {
    const res = await fetchFn(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        audience: OYSTEHR_TOKEN_AUDIENCE,
      }),
    });
    // Status only, never the response body: auth errors are not for the
    // browser or logs beyond their code (same posture as the transport).
    if (!res.ok) {
      throw Object.assign(
        new Error(`Oystehr token request failed: HTTP ${res.status}`),
        { statusCode: res.status },
      );
    }
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) {
      throw new Error("Oystehr token response did not include access_token.");
    }
    const ttl = tokenTtlMs(body.access_token) ?? FALLBACK_TTL_MS;
    cached = {
      value: body.access_token,
      expiresAt: Date.now() + Math.max(0, ttl - EXPIRY_MARGIN_MS),
    };
    return body.access_token;
  };

  return () => {
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.value);
    }
    // Single-flight: parallel searches during a cold start share one mint.
    if (!minting) {
      minting = mint().finally(() => {
        minting = undefined;
      });
    }
    return minting;
  };
}

export type OystehrBackendOptions = {
  /** M2M client credentials for the OAuth2 client-credentials flow. */
  clientId?: string;
  clientSecret?: string;
  /**
   * Pre-minted access token; skips the client-credentials flow entirely.
   * Note console-issued developer tokens require projectId, per the docs.
   */
  accessToken?: string;
  /** FHIR base; defaults to the official hosted R4 endpoint. */
  baseUrl?: string;
  /** Sent as x-oystehr-project-id when set. */
  projectId?: string;
  /** Token endpoint override; injectable for deterministic tests. */
  tokenUrl?: string;
  /** Injectable for deterministic tests (used for token AND FHIR calls). */
  fetch?: typeof globalThis.fetch;
};

export class OystehrBackend extends FhirRestBackend {
  constructor(options: OystehrBackendOptions = {}) {
    const {
      clientId,
      clientSecret,
      accessToken,
      baseUrl = OYSTEHR_FHIR_BASE_URL,
      projectId,
      tokenUrl = OYSTEHR_TOKEN_URL,
      fetch,
    } = options;
    if (!accessToken && !(clientId && clientSecret)) {
      throw new Error(
        "OystehrBackend requires clientId + clientSecret (M2M client credentials) or a pre-minted accessToken.",
      );
    }

    const projectHeader: Record<string, string> = projectId
      ? { "x-oystehr-project-id": projectId }
      : {};
    const token = accessToken
      ? undefined
      : createTokenSource(
          clientId as string,
          clientSecret as string,
          tokenUrl,
          // Bound at construction, exactly like the transport (rest.ts), so
          // token mints and FHIR calls always share one fetch identity.
          fetch ?? globalThis.fetch,
        );

    super({
      baseUrl,
      getHeaders: token
        ? async () => ({
            authorization: `Bearer ${await token()}`,
            ...projectHeader,
          })
        : () => ({ authorization: `Bearer ${accessToken}`, ...projectHeader }),
      fetch,
    });
  }
}
