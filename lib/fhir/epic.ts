import { randomUUID } from "node:crypto";

import { importPKCS8, SignJWT } from "jose";

import { FhirRestBackend } from "./rest";

/**
 * Epic's public FHIR R4 sandbox, as published by the sandbox CapabilityStatement
 * `implementation.url` on 2026-11-04. Patient data is not readable without a
 * token (unauthenticated Patient search returned HTTP 401).
 */
export const EPIC_SANDBOX_BASE_URL =
  "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4";

/** Token URL from the same sandbox's SMART configuration. */
export const EPIC_SANDBOX_TOKEN_URL =
  "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token";

const EXPIRY_MARGIN_MS = 60_000;
const FALLBACK_TTL_MS = 5 * 60 * 1000;
/** Epic rejects an authentication JWT whose exp is more than 5 minutes out. */
const ASSERTION_LIFETIME_SECONDS = 4 * 60;
const ASSERTION_NOT_BEFORE_SKEW_SECONDS = 30;

export type EpicBackendOptions = {
  /**
   * Pre-minted access token. Skips the backend-services assertion entirely.
   * Tests and operators who mint outside this process use this.
   */
  accessToken?: string;
  /** Non-production client id from an app registered on fhir.epic.com. Not a secret. */
  clientId?: string;
  /**
   * PKCS#8 PEM private key whose public half is registered on that app.
   * Never log this, and do not commit it.
   */
  privateKeyPem?: string;
  /** Optional `kid` for a JWKS-registered key. */
  privateKeyId?: string;
  /**
   * Optional space-delimited SMART scopes. Omitted unless set: Epic's
   * documented token POST requires grant_type, client_assertion_type, and
   * client_assertion, and app scopes are pre-registered.
   */
  scopes?: string;
  baseUrl?: string;
  tokenUrl?: string;
  fetch?: typeof globalThis.fetch;
};

function normalizePem(value: string): string {
  const trimmed = value.trim();
  return trimmed.includes("\\n") ? trimmed.replace(/\\n/g, "\n") : trimmed;
}

/**
 * SMART Backend Services client-credentials token source for Epic.
 * Signs a short-lived RS384 JWT (iss/sub = client id, aud = token URL)
 * and caches the access token until shortly before `expires_in`.
 */
function createEpicTokenSource(options: {
  clientId: string;
  privateKeyPem: string;
  privateKeyId?: string;
  scopes?: string;
  tokenUrl: string;
  fetchFn: typeof globalThis.fetch;
}): () => Promise<string> {
  let cached: { value: string; expiresAt: number } | undefined;
  let minting: Promise<string> | undefined;

  const mint = async (): Promise<string> => {
    const key = await importPKCS8(normalizePem(options.privateKeyPem), "RS384");
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({})
      .setProtectedHeader({
        alg: "RS384",
        typ: "JWT",
        ...(options.privateKeyId ? { kid: options.privateKeyId } : {}),
      })
      .setIssuer(options.clientId)
      .setSubject(options.clientId)
      .setAudience(options.tokenUrl)
      .setJti(randomUUID())
      .setIssuedAt(now - ASSERTION_NOT_BEFORE_SKEW_SECONDS)
      .setNotBefore(now - ASSERTION_NOT_BEFORE_SKEW_SECONDS)
      .setExpirationTime(now + ASSERTION_LIFETIME_SECONDS)
      .sign(key);

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
    });
    if (options.scopes) body.set("scope", options.scopes);

    const res = await options.fetchFn(options.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      throw Object.assign(
        new Error(`Epic token request failed: HTTP ${res.status}`),
        { statusCode: res.status },
      );
    }
    const payload = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!payload.access_token) {
      throw new Error("Epic token response did not include access_token.");
    }
    const ttlMs =
      typeof payload.expires_in === "number" && payload.expires_in > 0
        ? payload.expires_in * 1000
        : FALLBACK_TTL_MS;
    cached = {
      value: payload.access_token,
      expiresAt: Date.now() + Math.max(0, ttlMs - EXPIRY_MARGIN_MS),
    };
    return payload.access_token;
  };

  return () => {
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.value);
    }
    if (!minting) {
      minting = mint().finally(() => {
        minting = undefined;
      });
    }
    return minting;
  };
}

/**
 * Scaffold for Epic's FHIR R4 sandbox. Auth is SMART Backend Services
 * (client credentials with a private-key JWT). Standalone launch is
 * documented in docs/adapters/epic-cerner.md and is not implemented: it
 * needs a browser login this process does not run.
 *
 * Writes are the inherited REST POST. They are unverified against the
 * sandbox. Do not point this at a server holding real PHI.
 *
 * Registered as `FHIR_BACKEND=epic` only when
 * `LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1` and credentials are present.
 * CI skips the live test when those are absent. No secret is built in.
 */
export class EpicBackend extends FhirRestBackend {
  constructor(options: EpicBackendOptions = {}) {
    const {
      accessToken,
      clientId,
      privateKeyPem,
      privateKeyId,
      scopes,
      baseUrl = EPIC_SANDBOX_BASE_URL,
      tokenUrl = EPIC_SANDBOX_TOKEN_URL,
      fetch: fetchFn,
    } = options;
    if (!accessToken && !(clientId && privateKeyPem)) {
      throw new Error(
        "EpicBackend requires an accessToken, or a clientId and privateKeyPem for SMART Backend Services. No secret is built in.",
      );
    }

    const token =
      accessToken || !clientId || !privateKeyPem
        ? undefined
        : createEpicTokenSource({
            clientId,
            privateKeyPem,
            privateKeyId,
            scopes,
            tokenUrl,
            fetchFn: fetchFn ?? globalThis.fetch,
          });

    super({
      baseUrl,
      getHeaders: token
        ? async () => ({ authorization: `Bearer ${await token()}` })
        : () => ({ authorization: `Bearer ${accessToken}` }),
      fetch: fetchFn,
    });
  }
}
