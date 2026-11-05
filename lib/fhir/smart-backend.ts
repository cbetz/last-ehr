import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { importPKCS8, SignJWT } from "jose";

import {
  assessSmartAuth,
  type SmartAuthAssessment,
  type SmartAuthEnv,
} from "./smart-config";

const EXPIRY_MARGIN_MS = 60_000;
const FALLBACK_TTL_MS = 5 * 60 * 1000;
/** Epic rejects an authentication JWT whose exp is more than 5 minutes out. */
const ASSERTION_LIFETIME_SECONDS = 4 * 60;
const ASSERTION_NOT_BEFORE_SKEW_SECONDS = 30;

export type SmartBackendServicesOptions = {
  clientId: string;
  privateKeyPem: string;
  keyId?: string;
  /** Omitted from the token POST when unset. Oracle requires it; Epic does not. */
  scopes?: string;
  tokenUrl: string;
  fetch?: typeof globalThis.fetch;
};

export function normalizePem(value: string): string {
  const trimmed = value.trim();
  return trimmed.includes("\\n") ? trimmed.replace(/\\n/g, "\n") : trimmed;
}

/**
 * Read a PKCS#8 PEM from env or from a path. The returned string is the
 * key. Errors name the env var and never include the file contents.
 */
export function loadSmartPrivateKey(
  auth: Extract<SmartAuthAssessment, { state: "ready"; mode: "jwt" }>,
): string {
  if (auth.privateKeyPem) return normalizePem(auth.privateKeyPem);
  if (!auth.privateKeyPath) {
    throw new Error(
      "SMART Backend Services needs LASTEHR_PRIVATE_KEY or LASTEHR_PRIVATE_KEY_PATH.",
    );
  }
  try {
    return normalizePem(readFileSync(auth.privateKeyPath, "utf8"));
  } catch {
    throw new Error(
      "Could not read the SMART private key file named by LASTEHR_PRIVATE_KEY_PATH or the vendor key path. The file contents were not logged.",
    );
  }
}

export function readySmartAuth(
  env: SmartAuthEnv,
  vendor: "epic" | "oracle",
): Extract<SmartAuthAssessment, { state: "ready" }> | undefined {
  const auth = assessSmartAuth(env, vendor);
  if (auth.state !== "ready") return undefined;
  return auth;
}

/**
 * SMART Backend Services client-credentials token source.
 * Signs a short-lived RS384 JWT (iss = sub = client id, aud = token URL,
 * jti, exp at most 5 minutes ahead) and caches the access token until
 * shortly before `expires_in`. The key and the token are not logged.
 */
export function createSmartBackendServicesTokenSource(
  options: SmartBackendServicesOptions,
): () => Promise<string> {
  let cached: { value: string; expiresAt: number } | undefined;
  let minting: Promise<string> | undefined;
  const fetchFn = options.fetch ?? globalThis.fetch;

  const mint = async (): Promise<string> => {
    let key: Awaited<ReturnType<typeof importPKCS8>>;
    try {
      key = await importPKCS8(normalizePem(options.privateKeyPem), "RS384");
    } catch {
      throw new Error(
        "SMART Backend Services private key could not be parsed. Expected a PKCS#8 PEM.",
      );
    }
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({})
      .setProtectedHeader({
        alg: "RS384",
        typ: "JWT",
        ...(options.keyId ? { kid: options.keyId } : {}),
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

    const res = await fetchFn(options.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      // The body can echo the assertion. Do not attach it to the error.
      throw Object.assign(
        new Error(`SMART token request failed: HTTP ${res.status}`),
        { statusCode: res.status },
      );
    }
    const payload = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!payload.access_token) {
      throw new Error("SMART token response did not include access_token.");
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
