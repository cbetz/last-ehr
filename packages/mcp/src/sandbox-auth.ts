import { randomUUID } from "node:crypto";

import { importPKCS8, SignJWT } from "jose";

const ASSERTION_LIFETIME_SECONDS = 4 * 60;
const ASSERTION_SKEW_SECONDS = 30;
const EXPIRY_MARGIN_MS = 60_000;

export type TokenSourceOptions = {
  clientId: string;
  privateKeyPem: string;
  keyId?: string;
  scopes?: string;
  tokenUrl: string;
  fetch?: typeof globalThis.fetch;
};

/** Parse a PKCS#8 PEM. The error never includes the key. */
export async function assertPrivateKeyLoads(pem: string): Promise<void> {
  try {
    await importPKCS8(pem, "RS384");
  } catch {
    throw new Error(
      "Private key could not be parsed. Expected a PKCS#8 PEM for RS384.",
    );
  }
}

/**
 * SMART Backend Services token source. The access token and the assertion
 * stay in memory. Failures report only the HTTP status.
 */
export function createSandboxTokenSource(
  options: TokenSourceOptions,
): () => Promise<{ accessToken: string; scope?: string }> {
  let cached: { accessToken: string; scope?: string; expiresAt: number } | undefined;
  let minting: Promise<{ accessToken: string; scope?: string }> | undefined;
  const fetchFn = options.fetch ?? globalThis.fetch;

  const mint = async () => {
    let key: Awaited<ReturnType<typeof importPKCS8>>;
    try {
      key = await importPKCS8(options.privateKeyPem, "RS384");
    } catch {
      throw new Error(
        "Private key could not be parsed. Expected a PKCS#8 PEM for RS384.",
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
      .setIssuedAt(now - ASSERTION_SKEW_SECONDS)
      .setNotBefore(now - ASSERTION_SKEW_SECONDS)
      .setExpirationTime(now + ASSERTION_LIFETIME_SECONDS)
      .sign(key);
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
    });
    if (options.scopes) body.set("scope", options.scopes);
    const response = await fetchFn(options.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      throw Object.assign(
        new Error(`SMART token request failed: HTTP ${response.status}`),
        { statusCode: response.status },
      );
    }
    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!payload.access_token) {
      throw new Error("SMART token response did not include access_token.");
    }
    const ttlMs =
      typeof payload.expires_in === "number" && payload.expires_in > 0
        ? payload.expires_in * 1000
        : 5 * 60 * 1000;
    const minted = {
      accessToken: payload.access_token,
      scope: typeof payload.scope === "string" ? payload.scope : undefined,
      expiresAt: Date.now() + Math.max(0, ttlMs - EXPIRY_MARGIN_MS),
    };
    cached = minted;
    return { accessToken: minted.accessToken, scope: minted.scope };
  };

  return () => {
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve({
        accessToken: cached.accessToken,
        scope: cached.scope,
      });
    }
    if (!minting) {
      minting = mint().finally(() => {
        minting = undefined;
      });
    }
    return minting;
  };
}

const SCOPE_TOKEN = /^[A-Za-z0-9/*._:+-]{1,128}$/;

/** Keep granted-scope text to permission tokens. Anything else is withheld. */
export function safeScopeList(scope: string | undefined): string {
  if (!scope?.trim()) return "";
  const tokens = scope.trim().split(/\s+/);
  if (!tokens.every((token) => SCOPE_TOKEN.test(token))) {
    return "";
  }
  return tokens.join(" ");
}
