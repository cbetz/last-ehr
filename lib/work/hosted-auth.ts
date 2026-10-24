import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import { createOAuthTokenVerifier } from "../../packages/mcp/src/oauth-verifier";
import type { WorkActor } from "./service";

export type HostedWorkAuthConfig = {
  issuer: string;
  jwksUri: string;
  resource: string;
  tenantId: string;
  assistantIdentities: readonly { clientId: string; subject: string }[];
  reviewer: {
    subject: string;
    clientId: string;
    clientSecret?: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    redirectUri: string;
  };
};

export type HostedWorkAuthDependencies = {
  getKey?: JWTVerifyGetKey;
  fetch?: typeof fetch;
  now?: () => number;
  /** Tests must opt in explicitly as well as running under NODE_ENV=test. */
  allowInsecureLoopback?: true;
};

const errors = {
  invalid_configuration: "Hosted Work authentication configuration is invalid.",
  unauthorized: "This identity cannot access hosted Work.",
  reviewer_login_failed: "Reviewer sign-in could not be verified. Start a new sign-in.",
  login_capacity: "Reviewer sign-in is temporarily unavailable. Try again later.",
} as const;

/** Fixed diagnostics never expose credentials, upstream responses, or claims. */
export class HostedWorkAuthError extends Error {
  constructor(readonly code: keyof typeof errors) {
    super(errors[code]);
    this.name = "HostedWorkAuthError";
  }
}

export type HostedReviewerSession = { actor: WorkActor; expiresAt: number };

const LOGIN_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 60 * 60_000;
const MAP_CAPACITY = 128;
const TOKEN_TIMEOUT_MS = 10_000;
const TOKEN_RESPONSE_LIMIT = 64 * 1024;
const opaque = () => randomBytes(32).toString("base64url");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const opaqueValue = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const equal = (left: string, right: string) => timingSafeEqual(Buffer.from(digest(left), "hex"), Buffer.from(digest(right), "hex"));
const identity = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

function endpoint(value: string, testLoopback: boolean): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new HostedWorkAuthError("invalid_configuration"); }
  const exactLoopback = /^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[1-9][0-9]{0,4})?\//.test(value) &&
    ["127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(testLoopback && exactLoopback)) || url.username || url.password || url.search || url.hash) {
    throw new HostedWorkAuthError("invalid_configuration");
  }
}

function snapshotConfig(input: HostedWorkAuthConfig, deps: HostedWorkAuthDependencies): HostedWorkAuthConfig {
  try {
    const testLoopback = deps.allowInsecureLoopback === true && process.env.NODE_ENV === "test";
    if (deps.allowInsecureLoopback && !testLoopback) throw new HostedWorkAuthError("invalid_configuration");
    const config = {
      issuer: input.issuer, jwksUri: input.jwksUri, resource: input.resource, tenantId: input.tenantId,
      assistantIdentities: input.assistantIdentities.map((entry) => ({ ...entry })), reviewer: { ...input.reviewer },
    };
    for (const value of [config.issuer, config.jwksUri, config.resource, config.reviewer.authorizationEndpoint, config.reviewer.tokenEndpoint, config.reviewer.redirectUri]) endpoint(value, testLoopback);
    if (!/^[A-Za-z0-9._:@/-]{1,160}$/.test(config.tenantId) ||
      !identity(config.reviewer.subject, 512) || !identity(config.reviewer.clientId, 256) ||
      (config.reviewer.clientSecret !== undefined && !identity(config.reviewer.clientSecret, 4096)) ||
      config.assistantIdentities.length === 0 || config.assistantIdentities.length > 256 ||
      config.assistantIdentities.some((entry) => !identity(entry.clientId, 256) || !identity(entry.subject, 512))) throw new HostedWorkAuthError("invalid_configuration");
    const identities = config.assistantIdentities.map(({ clientId, subject }) => JSON.stringify([clientId, subject]));
    if (new Set(identities).size !== identities.length) throw new HostedWorkAuthError("invalid_configuration");
    return config;
  } catch { throw new HostedWorkAuthError("invalid_configuration"); }
}

export function createHostedWorkAuth(input: HostedWorkAuthConfig, deps: HostedWorkAuthDependencies = {}) {
  const config = snapshotConfig(input, deps);
  const now = deps.now ?? Date.now;
  const fetcher = deps.fetch ?? fetch;
  const getKey = deps.getKey ?? createRemoteJWKSet(new URL(config.jwksUri), { timeoutDuration: 5_000 });
  const verifier = createOAuthTokenVerifier({ ...config, requiredScopes: ["work:assistant"] }, getKey);
  const allowed = new Set(config.assistantIdentities.map(({ clientId, subject }) => JSON.stringify([clientId, subject])));
  const reviewerActor: WorkActor = Object.freeze({
    tenantId: config.tenantId, role: "reviewer",
    subject: `reviewer:${digest(JSON.stringify(["reviewer", config.issuer, config.reviewer.subject]))}`,
  });
  type Pending = { state: string; nonce: string; verifier: string; expiresAt: number };
  const pending = new Map<string, Pending>();
  const sessions = new Map<string, HostedReviewerSession>();
  let closed = false;

  function clock(): number {
    const at = now();
    if (!Number.isSafeInteger(at) || at < 0) throw new HostedWorkAuthError("unauthorized");
    return at;
  }

  function sweep(): void {
    const at = clock();
    for (const [key, login] of pending) if (login.expiresAt <= at) pending.delete(key);
    for (const [key, session] of sessions) if (session.expiresAt <= at) sessions.delete(key);
  }

  async function tokenResponse(body: URLSearchParams): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new HostedWorkAuthError("reviewer_login_failed")); }, TOKEN_TIMEOUT_MS);
    });
    const perform = async () => {
      const response = await fetcher(config.reviewer.tokenEndpoint, {
        method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(), redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal,
      });
      if (!response.ok || response.redirected || (response.url && response.url !== config.reviewer.tokenEndpoint) ||
        response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !response.body) {
        await response.body?.cancel();
        throw new HostedWorkAuthError("reviewer_login_failed");
      }
      const length = response.headers.get("content-length");
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > TOKEN_RESPONSE_LIMIT)) {
        await response.body.cancel();
        throw new HostedWorkAuthError("reviewer_login_failed");
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > TOKEN_RESPONSE_LIMIT) { await reader.cancel(); throw new HostedWorkAuthError("reviewer_login_failed"); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new HostedWorkAuthError("reviewer_login_failed");
      return value as Record<string, unknown>;
    };
    try { return await Promise.race([perform(), timeout]); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }

  return {
    reviewerActor,

    async verifyAssistant(authorization?: string): Promise<{ actor: WorkActor; principal: string; expiresAt: number }> {
      try {
        if (closed || typeof authorization !== "string" || authorization.length > 16_384) throw new HostedWorkAuthError("unauthorized");
        const bearer = authorization.match(/^Bearer ([^\s]+)$/i)?.[1];
        if (!bearer) throw new HostedWorkAuthError("unauthorized");
        const auth = await verifier.verifyAccessToken(bearer);
        const subject = auth.extra?.subject;
        const expiresAt = Number(auth.expiresAt) * 1000;
        if (closed || !identity(subject, 512) || subject === config.reviewer.subject || !Number.isSafeInteger(expiresAt) || expiresAt <= clock() ||
          !allowed.has(JSON.stringify([auth.clientId, subject]))) throw new HostedWorkAuthError("unauthorized");
        const actor: WorkActor = { tenantId: config.tenantId, role: "assistant", subject: `assistant:${digest(JSON.stringify(["assistant", config.issuer, auth.clientId, subject]))}` };
        return { actor, principal: actor.subject, expiresAt };
      } catch { throw new HostedWorkAuthError("unauthorized"); }
    },

    beginReviewerLogin(): { location: string; loginCookie: string } {
      if (closed) throw new HostedWorkAuthError("reviewer_login_failed");
      sweep();
      if (pending.size >= MAP_CAPACITY || sessions.size >= MAP_CAPACITY) throw new HostedWorkAuthError("login_capacity");
      const loginCookie = opaque();
      const login = { state: opaque(), nonce: opaque(), verifier: opaque(), expiresAt: clock() + LOGIN_TTL_MS };
      pending.set(digest(loginCookie), login);
      const location = new URL(config.reviewer.authorizationEndpoint);
      location.search = new URLSearchParams({
        response_type: "code", client_id: config.reviewer.clientId, redirect_uri: config.reviewer.redirectUri,
        scope: "openid", state: login.state, nonce: login.nonce,
        code_challenge: createHash("sha256").update(login.verifier).digest("base64url"), code_challenge_method: "S256",
      }).toString();
      return { location: location.href, loginCookie };
    },

    async finishReviewerLogin({ code, state, loginCookie }: { code: string; state: string; loginCookie: string }): Promise<HostedReviewerSession & { sessionCookie: string }> {
      try {
        if (closed) throw new HostedWorkAuthError("reviewer_login_failed");
        sweep();
        if (!opaqueValue(loginCookie)) throw new HostedWorkAuthError("reviewer_login_failed");
        const key = digest(loginCookie);
        const login = pending.get(key);
        // Consume once before any network operation, including failed exchanges.
        pending.delete(key);
        if (!login || !opaqueValue(state) || !equal(state, login.state) || !identity(code, 4096)) throw new HostedWorkAuthError("reviewer_login_failed");
        const body = new URLSearchParams({
          grant_type: "authorization_code", code, client_id: config.reviewer.clientId,
          redirect_uri: config.reviewer.redirectUri, code_verifier: login.verifier,
          ...(config.reviewer.clientSecret ? { client_secret: config.reviewer.clientSecret } : {}),
        });
        const response = await tokenResponse(body);
        if (typeof response.id_token !== "string" || response.id_token.length > TOKEN_RESPONSE_LIMIT) throw new HostedWorkAuthError("reviewer_login_failed");
        const { payload } = await jwtVerify(response.id_token, getKey, { issuer: config.issuer, audience: config.reviewer.clientId, currentDate: new Date(clock()) });
        const expiresAt = Number(payload.exp) * 1000;
        if (closed || payload.sub !== config.reviewer.subject || typeof payload.nonce !== "string" || !equal(payload.nonce, login.nonce) ||
          !Number.isSafeInteger(expiresAt) || expiresAt <= clock() ||
          typeof payload.iat !== "number" || !Number.isSafeInteger(payload.iat * 1000) || payload.iat * 1000 > clock() + 30_000 || payload.iat * 1000 >= expiresAt ||
          (payload.azp !== undefined && payload.azp !== config.reviewer.clientId) ||
          (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.reviewer.clientId)) throw new HostedWorkAuthError("reviewer_login_failed");
        sweep();
        if (sessions.size >= MAP_CAPACITY) throw new HostedWorkAuthError("reviewer_login_failed");
        const sessionCookie = opaque();
        const session = { actor: { ...reviewerActor }, expiresAt: Math.min(expiresAt, clock() + SESSION_TTL_MS) };
        sessions.set(digest(sessionCookie), session);
        return { sessionCookie, actor: { ...session.actor }, expiresAt: session.expiresAt };
      } catch { throw new HostedWorkAuthError("reviewer_login_failed"); }
    },

    getReviewerSession(sessionCookie?: string): HostedReviewerSession | undefined {
      if (closed || !opaqueValue(sessionCookie)) return undefined;
      sweep();
      const session = sessions.get(digest(sessionCookie));
      return session ? { actor: { ...session.actor }, expiresAt: session.expiresAt } : undefined;
    },

    endReviewerSession(sessionCookie?: string): void {
      if (opaqueValue(sessionCookie)) sessions.delete(digest(sessionCookie));
    },

    close(): void {
      closed = true;
      pending.clear();
      sessions.clear();
    },
  };
}
