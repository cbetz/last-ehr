import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { chromium, type Browser } from "@playwright/test";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";

import type { SyntheticIdentity, UserTokens } from "./types";

const CLIENT_ID = "lastehr-eval";
const RESOURCE_CLIENT_ID = "lastehr-mcp-resource";
const SCOPES = "openid profile email chart.read";
const REQUEST_TIMEOUT_MS = 10_000;
const LOGIN_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

type RealmOptions = {
  realmName: string;
  resource: string;
  redirectUri: string;
  writer: SyntheticIdentity;
  reader: SyntheticIdentity;
};

type LoginOptions = {
  issuer: string;
  resource: string;
  redirectUri: string;
  identity: SyntheticIdentity;
  clientId?: string;
  signal?: AbortSignal;
};

/** Codes are allowlisted protocol names, never provider descriptions. */
export class KeycloakLoginError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "KeycloakLoginError";
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function endpoint(value: string): URL {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash ||
    (url.protocol === "http:" && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  ) {
    throw new KeycloakLoginError("Keycloak endpoints must use HTTPS or loopback HTTP without URL credentials or query parameters.");
  }
  return url;
}

function callbackUrl(value: string): URL {
  const url = endpoint(value);
  if (
    url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !url.port || Number(url.port) === 0
  ) {
    throw new KeycloakLoginError("The login callback must use loopback HTTP with an explicit nonzero port.");
  }
  return url;
}

function resourceUri(value: string): string {
  const url = new URL(value);
  if (url.hash || url.search || url.username || url.password) {
    throw new KeycloakLoginError("The MCP resource must be an absolute URI without credentials, query parameters, or a fragment.");
  }
  return value;
}

/** Keycloak 26.8.1 realm import; the container enables resource-indicators. */
export function buildRealm(options: RealmOptions) {
  if (!/^[A-Za-z0-9._-]+$/.test(options.realmName)) {
    throw new KeycloakLoginError("The synthetic realm name is invalid.");
  }
  const resource = resourceUri(options.resource);
  const redirectUri = callbackUrl(options.redirectUri).href;
  const userProperty = (property: string, claim: string, type = "String") => ({
    name: claim,
    protocol: "openid-connect",
    protocolMapper: "oidc-usermodel-property-mapper",
    config: {
      "user.attribute": property,
      "claim.name": claim,
      "jsonType.label": type,
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true",
    },
  });
  const publicClient = (clientId: string, expires?: number) => ({
    clientId,
    enabled: true,
    protocol: "openid-connect",
    publicClient: true,
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    consentRequired: false,
    fullScopeAllowed: false,
    redirectUris: [redirectUri],
    webOrigins: [new URL(redirectUri).origin],
    defaultClientScopes: ["profile", "email"],
    optionalClientScopes: ["chart.read"],
    attributes: {
      "pkce.code.challenge.method": "S256",
      ...(expires ? { "access.token.lifespan": String(expires) } : {}),
    },
    protocolMappers: [{
      name: "allowed-mcp-resource",
      protocol: "openid-connect",
      protocolMapper: "oidc-audience-mapper",
      config: {
        "included.client.audience": RESOURCE_CLIENT_ID,
        "id.token.claim": "false",
        "access.token.claim": "true",
        "introspection.token.claim": "true",
      },
    }],
  });
  return {
    realm: options.realmName,
    enabled: true,
    // This disposable stack binds only to loopback; public userinfo has TLS.
    sslRequired: "none",
    registrationAllowed: false,
    resetPasswordAllowed: false,
    rememberMe: false,
    verifyEmail: false,
    accessTokenLifespan: 120,
    ssoSessionIdleTimeout: 300,
    ssoSessionMaxLifespan: 600,
    clientScopes: [
      {
        name: "chart.read",
        protocol: "openid-connect",
        attributes: { "include.in.token.scope": "true" },
      },
      {
        name: "profile",
        protocol: "openid-connect",
        attributes: { "include.in.token.scope": "true" },
        protocolMappers: [
          userProperty("username", "preferred_username"),
          userProperty("firstName", "given_name"),
          userProperty("lastName", "family_name"),
        ],
      },
      {
        name: "email",
        protocol: "openid-connect",
        attributes: { "include.in.token.scope": "true" },
        protocolMappers: [
          userProperty("email", "email"),
          userProperty("emailVerified", "email_verified", "boolean"),
        ],
      },
    ],
    clients: [
      {
        clientId: RESOURCE_CLIENT_ID,
        enabled: true,
        protocol: "openid-connect",
        bearerOnly: true,
        standardFlowEnabled: false,
        directAccessGrantsEnabled: false,
        attributes: { resource_url: resource },
      },
      publicClient(CLIENT_ID),
      publicClient("lastehr-expiry", 10),
    ],
    users: [options.writer, options.reader].map((identity) => ({
      id: identity.subject,
      username: identity.username,
      enabled: true,
      email: identity.email,
      emailVerified: true,
      firstName: identity.firstName,
      lastName: identity.lastName,
      requiredActions: [],
      credentials: [{ type: "password", value: identity.password, temporary: false }],
    })),
  };
}

function oauthCode(value: string | null): string {
  return value && ["invalid_target", "invalid_request", "invalid_scope", "access_denied", "unauthorized_client", "server_error", "temporarily_unavailable"].includes(value)
    ? value : "authorization_error";
}

function interrupted(): Error {
  return Object.assign(new Error("Synthetic login interrupted."), { name: "AbortError", code: "ABORT_ERR" });
}

function abortCheck(signal?: AbortSignal): void {
  if (signal?.aborted) throw interrupted();
}

async function withSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(interrupted());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    if (signal.aborted) onAbort();
  });
}

async function jsonRequest(url: URL, init: RequestInit = {}, signal?: AbortSignal): Promise<Record<string, unknown>> {
  abortCheck(signal);
  const response = await fetch(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...(signal ? [signal] : [])]),
    headers: { accept: "application/json", ...init.headers },
  });
  if (response.status >= 300 && response.status < 400) {
    void response.body?.cancel().catch(() => {});
    throw new KeycloakLoginError("Keycloak returned an unexpected redirect.");
  }
  if (!response.body) throw new KeycloakLoginError("Keycloak returned an empty response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new KeycloakLoginError("Keycloak response exceeded the size limit.");
      text += decoder.decode(value, { stream: true });
    }
    const parsed: unknown = JSON.parse(text + decoder.decode());
    if (!isObject(parsed)) throw new KeycloakLoginError("Keycloak returned an invalid JSON object.");
    if (!response.ok) {
      throw new KeycloakLoginError("Keycloak rejected the request.", oauthCode(typeof parsed.error === "string" ? parsed.error : null));
    }
    return parsed;
  } finally {
    void reader.cancel().catch(() => {});
  }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

/** Real authorization-code + S256 flow through Keycloak's Chromium login UI. */
export async function loginWithPkce(options: LoginOptions): Promise<UserTokens> {
  let browser: Browser | undefined;
  let callback: Server | undefined;
  let loginTimeout: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => {
    void browser?.close().catch(() => {});
    callback?.closeAllConnections();
    callback?.close();
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    abortCheck(options.signal);
    const issuer = endpoint(options.issuer).href.replace(/\/+$/, "");
    const redirect = callbackUrl(options.redirectUri);
    const resource = resourceUri(options.resource);
    const clientId = options.clientId ?? CLIENT_ID;
    const metadata = await jsonRequest(new URL(`${issuer}/.well-known/openid-configuration`), {}, options.signal);
    if (metadata.issuer !== issuer) throw new KeycloakLoginError("Keycloak discovery returned an unexpected issuer.");
    const providerEndpoint = (key: string) => {
      if (typeof metadata[key] !== "string") throw new KeycloakLoginError("Keycloak discovery omitted a required endpoint.");
      const url = endpoint(metadata[key]);
      if (url.origin !== new URL(issuer).origin) throw new KeycloakLoginError("Keycloak discovery returned an unexpected endpoint origin.");
      return url;
    };
    const authorize = providerEndpoint("authorization_endpoint");
    const tokenEndpoint = providerEndpoint("token_endpoint");
    const jwksEndpoint = providerEndpoint("jwks_uri");
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    let resolveCode: (code: string) => void;
    let rejectCode: (error: KeycloakLoginError) => void;
    const codeReceived = new Promise<string>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });
    // A callback arriving during Chromium startup must not become unhandled.
    void codeReceived.catch(() => {});
    callback = createServer((request, response) => {
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      const reject = (error: KeycloakLoginError) => {
        response.writeHead(400).end("Synthetic login failed.");
        rejectCode(error);
      };
      if (request.method !== "GET" || !request.url || request.url.length > 16_384) {
        response.writeHead(404).end();
        return;
      }
      let received: URL;
      try {
        received = new URL(request.url, redirect.origin);
      } catch {
        response.writeHead(400).end("Synthetic login failed.");
        return;
      }
      if (received.origin !== redirect.origin || received.pathname !== redirect.pathname) {
        response.writeHead(404).end();
        return;
      }
      const suppliedState = received.searchParams.get("state") ?? "";
      if (
        received.searchParams.getAll("state").length !== 1 ||
        Buffer.byteLength(suppliedState) !== Buffer.byteLength(state) ||
        !timingSafeEqual(Buffer.from(suppliedState), Buffer.from(state))
      ) {
        reject(new KeycloakLoginError("Keycloak callback state validation failed."));
        return;
      }
      if (received.searchParams.has("iss") && received.searchParams.get("iss") !== issuer) {
        reject(new KeycloakLoginError("Keycloak callback issuer validation failed."));
        return;
      }
      if (received.searchParams.has("error")) {
        reject(new KeycloakLoginError("Keycloak authorization was rejected.", oauthCode(received.searchParams.get("error"))));
        return;
      }
      const code = received.searchParams.get("code");
      if (!code || received.searchParams.getAll("code").length !== 1) {
        reject(new KeycloakLoginError("Keycloak callback omitted a valid authorization code."));
        return;
      }
      response.writeHead(200).end("Synthetic login complete. This window can close.");
      resolveCode(code);
    });
    callback.on("error", () => rejectCode(new KeycloakLoginError("The loopback callback server failed.")));
    await withSignal(new Promise<void>((resolve, reject) => {
      callback!.once("error", () => reject(new KeycloakLoginError("The loopback callback port is unavailable.")));
      callback!.listen(Number(redirect.port), redirect.hostname.replace(/^\[|\]$/g, ""), resolve);
    }), options.signal);
    try {
      const launching = chromium.launch({ headless: true, timeout: 15_000 });
      // Chromium launch has no AbortSignal API. A late launch must still be
      // closed if interruption wins the race before the Browser is available.
      void launching.then(instance => {
        if (options.signal?.aborted) void instance.close().catch(() => {});
      }, () => {});
      browser = await withSignal(launching, options.signal);
    } catch {
      abortCheck(options.signal);
      throw new KeycloakLoginError("Chromium could not start. Install the project's Playwright Chromium browser and retry.");
    }
    // Playwright library contexts do not inherit the test runner's tracing,
    // screenshots or video settings; none are enabled for this credential UI.
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    for (const [key, value] of Object.entries({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirect.href,
      scope: SCOPES,
      resource,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    })) authorize.searchParams.set(key, value);
    const interactive = (async () => {
      await page.goto(authorize.href, { waitUntil: "domcontentloaded" });
      await page.locator("#username").fill(options.identity.username);
      await page.locator("#password").fill(options.identity.password);
      await page.locator("#kc-login").click();
      return codeReceived;
    })();
    const deadline = new Promise<never>((_, reject) => {
      loginTimeout = setTimeout(() => reject(new KeycloakLoginError("Keycloak browser login timed out.")), LOGIN_TIMEOUT_MS);
    });
    const code = await withSignal(Promise.race([codeReceived, interactive, deadline]), options.signal);
    const tokens = await jsonRequest(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirect.href,
        code,
        code_verifier: verifier,
        resource,
      }),
    }, options.signal);
    if (
      typeof tokens.access_token !== "string" || !tokens.access_token ||
      typeof tokens.id_token !== "string" || !tokens.id_token ||
      typeof tokens.token_type !== "string" || tokens.token_type.toLowerCase() !== "bearer"
    ) throw new KeycloakLoginError("Keycloak omitted the expected bearer and ID tokens.");
    const keys = await jsonRequest(jwksEndpoint, {}, options.signal);
    if (!Array.isArray(keys.keys)) throw new KeycloakLoginError("Keycloak returned an invalid JWKS.");
    const getKey = createLocalJWKSet({ keys: keys.keys as JSONWebKeySet["keys"] });
    const access = await jwtVerify(tokens.access_token, getKey, { issuer, audience: resource });
    const id = await jwtVerify(tokens.id_token, getKey, { issuer, audience: clientId });
    const audience = access.payload.aud;
    const scopes = typeof access.payload.scope === "string" ? access.payload.scope.split(" ") : [];
    if (
      access.payload.sub !== options.identity.subject || id.payload.sub !== options.identity.subject ||
      id.payload.nonce !== nonce || access.payload.azp !== clientId ||
      typeof access.payload.exp !== "number" || !scopes.includes("openid") || !scopes.includes("chart.read") ||
      !(audience === resource || (Array.isArray(audience) && audience.length === 1 && audience[0] === resource))
    ) throw new KeycloakLoginError("Keycloak token identity, nonce, or resource validation failed.");
    abortCheck(options.signal);
    return { accessToken: tokens.access_token, idToken: tokens.id_token };
  } catch (error) {
    // Browser and JSON parser errors can quote URLs, fields or response data.
    // Do not attach the original error as a cause or pass it to diagnostics.
    abortCheck(options.signal);
    throw error instanceof KeycloakLoginError
      ? error : new KeycloakLoginError("Keycloak browser login failed; provider diagnostics were withheld.");
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    clearTimeout(loginTimeout);
    await browser?.close().catch(() => {});
    if (callback) await closeServer(callback);
  }
}
