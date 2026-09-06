import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { createHash, randomUUID } from "node:crypto";

import { MedplumClient } from "@medplum/core";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  InsufficientScopeError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { isInitializeRequest, isJSONRPCRequest } from "@modelcontextprotocol/sdk/types.js";
import { decodeJwt } from "jose";

import { createElicitationApproval } from "./approval.js";
import {
  McpConfigurationError,
  type McpHttpConfig,
  type McpRuntimeConfig,
} from "./config.js";
import {
  createOAuthTokenVerifier,
  type OAuthTokenVerifier,
} from "./oauth-verifier.js";
import { createReadTools } from "./read-tools.js";
import { buildResourceMetadata } from "./resource-metadata.js";
import { createMcpServer } from "./server.js";
import {
  exchangeForFhirToken,
  TokenExchangeError,
  type ExchangedFhirToken,
} from "./token-exchange.js";
import {
  createWriteTools,
  writeToolOptionsFromConfig,
  type FhirWriteClient,
} from "./write-tools.js";

/**
 * The remote (HTTP) transport designed in docs/remote-mcp.md.
 *
 * What this module is: an OAuth 2.1 resource server in front of one MCP
 * `Server` per session. Every request presents a bearer that must be addressed
 * to this server; the caller's own FHIR credential is obtained once per session
 * by RFC 8693 exchange, so this process holds no FHIR credential of its own and
 * the FHIR backend's AccessPolicy still decides what each caller can reach.
 *
 * What it deliberately is not: an authorization server (it issues nothing), a
 * relay for FHIR tokens (the probe in docs/remote-mcp.md shows every Medplum
 * token is addressed to Medplum, so the verifier refuses them), or a shared
 * credential (which would make this layer, not the backend, the thing that
 * decides who sees what — the one thing the roadmap says this project does not
 * do).
 *
 * Nothing here is imported by the stdio path. cli.ts loads this module only on
 * the http branch, so a stdio process never pulls in node:http or the SDK's
 * Node transport.
 */

export type RemoteSessionLimits = {
  maxSessions: number;
  maxSessionsPerPrincipal: number;
  idleTimeoutMs: number;
  maxBodyBytes: number;
  /** Stop serving this long before the exchanged FHIR token expires. */
  expirySkewMs: number;
  /** Lifetime assumed when the exchange reports none and the token has no exp. */
  fallbackCredentialTtlMs: number;
  /**
   * Upper bound on the FHIR token exchange. A stalled token endpoint would
   * otherwise pin a capacity reservation for as long as fetch is willing to
   * wait, and capacity is a hard bound that never evicts.
   */
  exchangeTimeoutMs: number;
};

export const DEFAULT_REMOTE_SESSION_LIMITS: RemoteSessionLimits = {
  maxSessions: 256,
  maxSessionsPerPrincipal: 8,
  idleTimeoutMs: 30 * 60_000,
  maxBodyBytes: 1_048_576,
  expirySkewMs: 30_000,
  fallbackCredentialTtlMs: 3_600_000,
  exchangeTimeoutMs: 15_000,
};

const SWEEP_INTERVAL_MS = 60_000;
const DOCUMENTATION_URL = "https://www.lastehr.com/docs/mcp";

/**
 * One constant so unknown, foreign, expired, revoked, and idle sessions answer
 * byte-identical bodies. A 403 or a distinguishable message would confirm that
 * a session id exists, which is an enumeration oracle for any token holder.
 * Mirrors the SDK's own wording for a missing session.
 */
const SESSION_NOT_FOUND_BODY =
  '{"jsonrpc":"2.0","error":{"code":-32001,"message":"Session not found"},"id":null}';

export type FhirSessionClient = { client: FhirWriteClient; dispose?: () => void };

export type RemoteMcpDependencies = {
  /** Default: createOAuthTokenVerifier over config.http and a remote JWKS. */
  verifier?: OAuthTokenVerifier;
  /** Default: exchangeForFhirToken against config.http with fetchImpl. */
  exchange?: (callerToken: string) => Promise<ExchangedFhirToken>;
  /** Default: globalThis.fetch. Used by the default exchange and session client. */
  fetchImpl?: typeof fetch;
  /** Default: a MedplumClient holding only the exchanged token. */
  createFhirClient?: (
    exchanged: ExchangedFhirToken,
    hooks: { onUnauthenticated: () => void },
  ) => FhirSessionClient;
  /** Milliseconds since the epoch. Default: Date.now. */
  now?: () => number;
  sessionIdGenerator?: () => string;
  /** Default: console.error — stderr, matching the stdio server. */
  log?: (line: string) => void;
  limits?: Partial<RemoteSessionLimits>;
};

/**
 * The socket-free view of a request that decide() works on, so every gate,
 * binding, and error-mapping case is a unit test with no ports.
 */
export type InboundRequest = {
  method: string;
  /** Only pathname is read. Host is never consulted for routing or authorization. */
  url: URL;
  headers: Headers;
  readBody(
    maxBytes: number,
  ): Promise<{ ok: true; text: string } | { ok: false; reason: "too_large" }>;
};

export type RemoteDecision =
  | { kind: "respond"; status: number; headers: Record<string, string>; body: string }
  | {
      kind: "transport";
      transport: StreamableHTTPServerTransport;
      /** token is always "" — see redactAuthInfo. */
      authInfo: AuthInfo;
      parsedBody?: unknown;
      afterHandled(): Promise<void>;
    };

export type RemoteSession = {
  id: string;
  principal: string;
  clientId: string;
  profile?: string;
  createdAt: number;
  lastSeenAt: number;
  credentialExpiresAt: number;
  revoked: boolean;
  server: Server;
  transport: StreamableHTTPServerTransport;
  fhir: FhirSessionClient;
  closing?: Promise<void>;
  // Deliberately not fields: the caller token (re-presented and re-verified on
  // every request), the exchanged token (it lives only inside the client the
  // factory built), any AuthInfo.
};

type CloseReason = "delete" | "expired" | "revoked" | "idle" | "shutdown" | "init_failed";

export type RemoteMcpHandler = {
  paths: { mcp: string; metadata: string };
  registry: RemoteSessionRegistry;
  decide(request: InboundRequest): Promise<RemoteDecision>;
  listener(req: IncomingMessage, res: ServerResponse): Promise<void>;
  /** Closes stale sessions and cuts expired streams; returns sessions closed. */
  sweep(): Promise<number>;
  sessionCount(): number;
  close(): Promise<void>;
};

export type StartedRemoteMcpServer = {
  config: McpRuntimeConfig;
  handler: RemoteMcpHandler;
  httpServer: HttpServer;
  address: { host: string; port: number };
  close(): Promise<void>;
};

// ---------------------------------------------------------------------------
// Session registry
// ---------------------------------------------------------------------------

type ReserveResult =
  | { ok: true; commit(session: RemoteSession): void; release(): void }
  | { ok: false; reason: "capacity" | "principal_limit" };

type LookupResult =
  | { ok: true; session: RemoteSession }
  | {
      ok: false;
      reason: "unknown" | "foreign" | "expired" | "revoked" | "idle";
      session?: RemoteSession;
    };

export class RemoteSessionRegistry {
  private readonly byId = new Map<string, RemoteSession>();
  private readonly committed = new Map<string, number>();
  private readonly pending = new Map<string, number>();
  private pendingTotal = 0;

  constructor(
    private readonly limits: RemoteSessionLimits,
    private readonly now: () => number,
  ) {}

  /**
   * Capacity is a HARD bound: pending reservations count, so concurrent
   * initializes cannot overshoot while their exchanges are in flight. At
   * capacity a new session is refused, never evicted — eviction would let one
   * authenticated caller log another one out.
   */
  reserve(principal: string): ReserveResult {
    if (this.byId.size + this.pendingTotal >= this.limits.maxSessions) {
      return { ok: false, reason: "capacity" };
    }
    const held = (this.committed.get(principal) ?? 0) + (this.pending.get(principal) ?? 0);
    if (held >= this.limits.maxSessionsPerPrincipal) {
      return { ok: false, reason: "principal_limit" };
    }
    this.pending.set(principal, (this.pending.get(principal) ?? 0) + 1);
    this.pendingTotal += 1;
    let settled = false;
    const releasePending = () => {
      const left = (this.pending.get(principal) ?? 1) - 1;
      if (left <= 0) this.pending.delete(principal);
      else this.pending.set(principal, left);
      this.pendingTotal = Math.max(0, this.pendingTotal - 1);
    };
    return {
      ok: true,
      commit: (session) => {
        if (settled) return;
        settled = true;
        releasePending();
        if (this.byId.has(session.id)) {
          // Only an injected generator can produce this; a silent overwrite
          // would orphan a live session and over-count its principal forever.
          throw new Error(`Duplicate session id ${session.id}`);
        }
        this.byId.set(session.id, session);
        this.committed.set(principal, (this.committed.get(principal) ?? 0) + 1);
      },
      release: () => {
        if (settled) return;
        settled = true;
        releasePending();
      },
    };
  }

  /**
   * A foreign principal is reported without touching the session: no
   * lastSeenAt update, no teardown. A mismatch must not become a lever to
   * keep someone else's session alive or to end it.
   */
  lookup(id: string, principal: string): LookupResult {
    const session = this.byId.get(id);
    if (!session) return { ok: false, reason: "unknown" };
    if (session.principal !== principal) return { ok: false, reason: "foreign" };
    const now = this.now();
    if (session.revoked) return { ok: false, reason: "revoked", session };
    if (now >= session.credentialExpiresAt) return { ok: false, reason: "expired", session };
    if (now - session.lastSeenAt >= this.limits.idleTimeoutMs) {
      return { ok: false, reason: "idle", session };
    }
    session.lastSeenAt = now;
    return { ok: true, session };
  }

  remove(id: string): RemoteSession | undefined {
    const session = this.byId.get(id);
    if (!session) return undefined;
    this.byId.delete(id);
    const left = (this.committed.get(session.principal) ?? 1) - 1;
    if (left <= 0) this.committed.delete(session.principal);
    else this.committed.set(session.principal, left);
    return session;
  }

  stale(): Array<{ session: RemoteSession; reason: "expired" | "revoked" | "idle" }> {
    const now = this.now();
    const out: Array<{ session: RemoteSession; reason: "expired" | "revoked" | "idle" }> = [];
    for (const session of this.byId.values()) {
      if (session.revoked) out.push({ session, reason: "revoked" });
      else if (now >= session.credentialExpiresAt) out.push({ session, reason: "expired" });
      else if (now - session.lastSeenAt >= this.limits.idleTimeoutMs) {
        out.push({ session, reason: "idle" });
      }
    }
    return out;
  }

  values(): RemoteSession[] {
    return [...this.byId.values()];
  }

  get size(): number {
    return this.byId.size;
  }

  /** Committed plus pending — what reserve() actually counts against. */
  get reserved(): number {
    return this.byId.size + this.pendingTotal;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * RFC 9728 path-based discovery. Reproduces the SDK's
 * getOAuthProtectedResourceMetadataUrl rather than importing it, because that
 * module's first line imports express and it reads an env flag at load time.
 * resource-metadata.test.ts pins this function to the SDK's, importing the SDK
 * module only inside the test.
 */
export function protectedResourceMetadataUrl(resource: URL): string {
  const suffix = resource.pathname && resource.pathname !== "/" ? resource.pathname : "";
  return new URL(`/.well-known/oauth-protected-resource${suffix}`, resource).href;
}

/**
 * Both paths derive from the one configured resource so the endpoint, the
 * verifier's required audience, and the metadata document cannot drift. No
 * trailing-slash normalisation: the resource identifier IS the endpoint a
 * client posts to, so "https://x/mcp/" must accept "/mcp/" and refuse "/mcp".
 */
export function remoteMcpPaths(resource: string): {
  mcp: string;
  metadata: string;
  metadataUrl: string;
} {
  const url = new URL(resource);
  const metadataUrl = protectedResourceMetadataUrl(url);
  return {
    mcp: url.pathname || "/",
    metadata: new URL(metadataUrl).pathname,
    metadataUrl,
  };
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

/**
 * This process speaks plain HTTP. Off loopback it must sit behind a TLS
 * terminator, and the only signal it has for that is the resource identifier's
 * scheme. Bearer tokens must not cross a network in plaintext.
 */
export function assertBindIsSafe(http: McpHttpConfig): void {
  if (LOOPBACK_HOSTS.has(http.host)) return;
  if (new URL(http.resource).protocol === "https:") return;
  throw new McpConfigurationError(
    "LASTEHR_MCP_HTTP_HOST is not loopback and LASTEHR_MCP_RESOURCE is not https. Bearer tokens must not cross a network in plaintext: bind to 127.0.0.1 behind a TLS terminator, or use an https resource identifier.",
  );
}

/**
 * An exchanged FHIR token is only ever sent to the server that issued it. The
 * default MedplumClient base URL is api.medplum.com, so falling through to it
 * for a self-hosted operator would post their users' tokens to a server they do
 * not run. Derive from the token endpoint, and refuse an explicit base URL on a
 * different origin.
 */
export function fhirBaseUrlFor(config: McpRuntimeConfig & { http: McpHttpConfig }): string {
  const tokenOrigin = new URL(config.http.tokenEndpoint).origin;
  if (config.baseUrl) {
    if (new URL(config.baseUrl).origin !== tokenOrigin) {
      throw new McpConfigurationError(
        "MEDPLUM_BASE_URL and LASTEHR_MCP_TOKEN_ENDPOINT must share an origin: an exchanged FHIR token is only ever sent to the server that issued it.",
      );
    }
    return config.baseUrl;
  }
  return `${tokenOrigin}/`;
}

/**
 * The verifier forwards jose's reason text, which contains double quotes for
 * the most common failures (`"exp" claim timestamp check failed`). Quoted
 * inside WWW-Authenticate those would end the RFC 7235 quoted-string early.
 */
export function sanitizeChallengeText(text: string): string {
  return text.replace(/["\\]/g, "'").replace(/[^\x20-\x7e]/g, "");
}

/**
 * Bearer extraction and verification, in the SDK's own order and wording, plus
 * two checks the design adds: an expiry check on the injected clock (so an
 * injected verifier cannot leave the gap open), and a required subject.
 *
 * `sub` is required because a session is bound to the caller who opened it,
 * and a caller the token cannot name cannot be bound. Under the chosen design
 * the FHIR exchange resolves the user through the identity provider anyway, so
 * a subject-less token could never yield a credential; refusing it here saves a
 * wasted Medplum login and closes the case where two holders of one confidential
 * client's tokens could enter each other's sessions.
 */
export async function authenticateBearer(
  authorization: string | null,
  verifier: OAuthTokenVerifier,
  nowMs: number,
): Promise<AuthInfo> {
  if (!authorization) {
    throw new InvalidTokenError("Missing Authorization header");
  }
  const parts = authorization.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1]) {
    throw new InvalidTokenError(
      "Invalid Authorization header format, expected 'Bearer TOKEN'",
    );
  }
  const auth = await verifier.verifyAccessToken(parts[1]);
  if (typeof auth.expiresAt !== "number" || Number.isNaN(auth.expiresAt)) {
    throw new InvalidTokenError("Token has no expiration time");
  }
  if (auth.expiresAt * 1000 <= nowMs) {
    throw new InvalidTokenError("Token has expired");
  }
  const subject = auth.extra?.subject;
  if (typeof subject !== "string" || subject === "") {
    throw new InvalidTokenError("Token identifies no subject");
  }
  return auth;
}

/**
 * Credential-layer refusals use the OAuth error-object shape; transport-layer
 * refusals elsewhere use the SDK's JSON-RPC envelope. Stated here so the two
 * shapes are a decision rather than an accident.
 */
export function oauthChallenge(
  error: unknown,
  options: { resourceMetadataUrl: string; requiredScopes: readonly string[] },
): { status: 401 | 403 | 500; headers: Record<string, string>; body: string } {
  const challenge = (code: string, message: string): string => {
    let header = `Bearer error="${code}", error_description="${sanitizeChallengeText(message)}"`;
    if (options.requiredScopes.length > 0) {
      header += `, scope="${options.requiredScopes.join(" ")}"`;
    }
    header += `, resource_metadata="${options.resourceMetadataUrl}"`;
    return header;
  };
  if (error instanceof InvalidTokenError) {
    return {
      status: 401,
      headers: { "www-authenticate": challenge(error.errorCode, error.message) },
      body: JSON.stringify(error.toResponseObject()),
    };
  }
  if (error instanceof InsufficientScopeError) {
    return {
      status: 403,
      headers: { "www-authenticate": challenge(error.errorCode, error.message) },
      body: JSON.stringify(error.toResponseObject()),
    };
  }
  // JWKS unreachable, a bug — anything else. No challenge (the token was not
  // judged), and no detail on the wire (the message may name internal URLs).
  return {
    status: 500,
    headers: {},
    body: JSON.stringify({
      error: "server_error",
      error_description: "Token verification failed.",
    }),
  };
}

/**
 * The identity a session is bound to. Issuer is a process constant today; it
 * is in the key so a second issuer could never silently collide. Scopes are not
 * in the key, so narrowing or reordering them cannot break a session (the
 * verifier still enforces requiredScopes as a floor on every request).
 */
export function sessionPrincipal(auth: AuthInfo): string {
  return JSON.stringify([
    String(auth.extra?.issuer ?? ""),
    auth.clientId,
    String(auth.extra?.subject),
  ]);
}

function jwtExpMs(token: string): number | undefined {
  try {
    const { exp } = decodeJwt(token);
    return typeof exp === "number" ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * When to stop serving a session's FHIR credential. RFC 6749 only RECOMMENDS
 * expires_in, so an absent value is bounded by us — by the caller
 * authorization that justified the exchange and by a fixed ceiling — never
 * trusted forever. The skew means a request accepted at the edge never issues
 * FHIR calls after the token has lapsed.
 */
export function credentialDeadline(
  exchanged: ExchangedFhirToken,
  callerExpiresAtSeconds: number,
  nowMs: number,
  limits: RemoteSessionLimits,
): number {
  const fromExchange =
    exchanged.expiresAt !== undefined
      ? exchanged.expiresAt * 1000
      : (jwtExpMs(exchanged.accessToken) ??
        Math.min(callerExpiresAtSeconds * 1000, nowMs + limits.fallbackCredentialTtlMs));
  return fromExchange - limits.expirySkewMs;
}

/** The transport sees who the caller is, never what they presented. */
export function redactAuthInfo(auth: AuthInfo): AuthInfo {
  return { ...auth, token: "" };
}

/**
 * The SDK builds extra.requestInfo.headers from the incoming request's
 * headers, and @hono/node-server builds those from IncomingMessage.rawHeaders.
 * Deleting only headers.authorization would leave the bearer reachable from a
 * tool handler, so both views are rewritten. Pinned by a loopback test.
 */
export function stripAuthorization(req: IncomingMessage): void {
  const raw = req.rawHeaders;
  const kept: string[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    if (raw[i].toLowerCase() !== "authorization") kept.push(raw[i], raw[i + 1]);
  }
  req.rawHeaders = kept;
  delete req.headers.authorization;
}

const shortId = (id: string): string =>
  createHash("sha256").update(id).digest("hex").slice(0, 8);

const rpcError = (code: number, message: string): string =>
  JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null });

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

class ExchangeTimeoutError extends Error {
  constructor(ms: number) {
    super(`Token exchange did not complete within ${ms} ms.`);
    this.name = "ExchangeTimeoutError";
  }
}

/**
 * Bounds an awaited exchange. The underlying fetch may linger, but the
 * capacity reservation is released and the caller gets an answer.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ExchangeTimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

export function createRemoteMcpHandler(
  config: McpRuntimeConfig,
  deps: RemoteMcpDependencies = {},
): RemoteMcpHandler {
  if (config.transport !== "http" || !config.http) {
    throw new McpConfigurationError(
      "createRemoteMcpHandler requires a configuration with LASTEHR_MCP_TRANSPORT=http.",
    );
  }
  const http = config.http;
  const httpConfig = config as McpRuntimeConfig & { http: McpHttpConfig };
  assertBindIsSafe(http);
  const fhirBaseUrl = fhirBaseUrlFor(httpConfig);

  const limits: RemoteSessionLimits = { ...DEFAULT_REMOTE_SESSION_LIMITS, ...deps.limits };
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? ((line: string) => console.error(line));
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const sessionIdGenerator = deps.sessionIdGenerator ?? randomUUID;
  const verifier = deps.verifier ?? createOAuthTokenVerifier(http);
  const exchange =
    deps.exchange ??
    ((callerToken: string) =>
      exchangeForFhirToken(
        callerToken,
        {
          tokenEndpoint: http.tokenEndpoint,
          clientId: http.exchangeClientId,
          membershipId: http.membershipId,
        },
        fetchImpl,
      ));
  const createFhirClient =
    deps.createFhirClient ??
    ((exchanged: ExchangedFhirToken, hooks: { onUnauthenticated: () => void }) => {
      // No refresh token and no client id/secret: refresh() is a no-op in that
      // state, so on a FHIR 401 the client clears itself, fires the hook, and
      // throws. This client can never re-authenticate as anyone.
      const medplum = new MedplumClient({
        baseUrl: fhirBaseUrl,
        fetch: fetchImpl,
        onUnauthenticated: hooks.onUnauthenticated,
      });
      medplum.setAccessToken(exchanged.accessToken);
      return {
        client: medplum,
        // Zeroes the token and drops the request cache, so the credential does
        // not linger in a closed session.
        dispose: () => medplum.clearActiveLogin(),
      };
    });

  const paths = remoteMcpPaths(http.resource);
  const registry = new RemoteSessionRegistry(limits, now);
  // Set at the start of close(). A session whose exchange was in flight when
  // shutdown began must not commit into a registry nobody will sweep.
  let closed = false;
  const metadataBody = JSON.stringify(
    buildResourceMetadata({
      resource: http.resource,
      authorizationServer: http.issuer,
      scopesSupported: http.requiredScopes,
      documentation: DOCUMENTATION_URL,
    }),
  );

  const respond = (
    status: number,
    body: string,
    headers: Record<string, string> = {},
  ): RemoteDecision => ({ kind: "respond", status, headers: { ...JSON_HEADERS, ...headers }, body });

  async function closeSession(session: RemoteSession, reason: CloseReason): Promise<void> {
    if (session.closing) return session.closing;
    session.closing = (async () => {
      if (session.id) registry.remove(session.id);
      try {
        session.fhir.dispose?.();
      } catch {
        // A dispose failure must not keep the session registered.
      }
      // On DELETE the SDK has already closed the transport itself; closing the
      // Server again would double-close. Every other reason closes the Server,
      // which rejects any pending elicitation with ConnectionClosed, and the
      // approval resolves "unavailable" — the write saves nothing.
      if (reason !== "delete") {
        try {
          await session.server.close();
        } catch {
          // Already closed, or the transport threw on teardown. Either way the
          // registry entry is gone, which is the property that matters.
        }
      }
      log(`remote-mcp session closed session=${session.id ? shortId(session.id) : "-"} reason=${reason}`);
    })();
    return session.closing;
  }

  /**
   * Closes stale sessions. The standalone GET stream is deliberately NOT cut
   * when the token that opened it expires: it was authorized when opened, and
   * it ends with the session at the credential deadline or idle timeout, the
   * same rule a long POST already follows. Cutting it proactively could drop
   * a server->client message in the reconnect gap; approvals no longer ride
   * that stream (see request-context.ts), but nothing else should either.
   */
  async function sweep(): Promise<number> {
    let closed = 0;
    for (const { session, reason } of registry.stale()) {
      await closeSession(session, reason);
      closed += 1;
    }
    return closed;
  }

  async function readJsonBody(
    request: InboundRequest,
  ): Promise<{ ok: true; body: unknown } | { ok: false; decision: RemoteDecision }> {
    const read = await request.readBody(limits.maxBodyBytes);
    if (!read.ok) {
      return {
        ok: false,
        decision: respond(413, rpcError(-32000, "Request body too large"), {
          connection: "close",
        }),
      };
    }
    try {
      return { ok: true, body: JSON.parse(read.text) as unknown };
    } catch {
      return { ok: false, decision: respond(400, rpcError(-32700, "Parse error: Invalid JSON")) };
    }
  }

  async function decide(request: InboundRequest): Promise<RemoteDecision> {
    const pathname = request.url.pathname;

    // 1. Metadata: unauthenticated by design. RFC 9728 discovery must work
    //    before a token exists. GET only.
    if (pathname === paths.metadata) {
      if (request.method === "GET") {
        return {
          kind: "respond",
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
          body: metadataBody,
        };
      }
      return respond(405, JSON.stringify({ error: "method_not_allowed" }), { allow: "GET" });
    }

    // 2. Anything that is not the MCP endpoint. The verifier is not consulted.
    if (pathname !== paths.mcp) {
      return respond(404, JSON.stringify({ error: "not_found" }));
    }

    if (closed) {
      return respond(503, rpcError(-32000, "Server is shutting down"), { "retry-after": "30" });
    }

    // 3. The bearer gate — before the method check, so no request of any
    //    method on the MCP path is answered by MCP logic without a verified
    //    bearer. Nothing about the caller is cached between requests.
    let auth: AuthInfo;
    try {
      auth = await authenticateBearer(request.headers.get("authorization"), verifier, now());
    } catch (error) {
      const challenge = oauthChallenge(error, {
        resourceMetadataUrl: paths.metadataUrl,
        requiredScopes: http.requiredScopes,
      });
      if (challenge.status === 500) {
        log(
          `remote-mcp auth failed status=500 ${error instanceof Error ? error.message : "unknown error"}`,
        );
      } else {
        log(
          `remote-mcp auth rejected status=${challenge.status} ${sanitizeChallengeText(
            error instanceof Error ? error.message : "rejected",
          )}`,
        );
      }
      return respond(challenge.status, challenge.body, challenge.headers);
    }

    // 4. The identity this request acts as.
    const principal = sessionPrincipal(auth);

    // 5. Method check, after the gate.
    if (request.method !== "POST" && request.method !== "GET" && request.method !== "DELETE") {
      return respond(405, rpcError(-32000, "Method not allowed."), {
        allow: "GET, POST, DELETE",
      });
    }

    const sessionId = request.headers.get("mcp-session-id");

    // 7. A request into an existing session. The body is read BEFORE the
    //    registry is consulted: the body is bounded anyway, and reading it
    //    first means a session torn down during a slow upload is seen as gone
    //    by the lookup rather than handed a dead transport. Found by
    //    adversarial review.
    if (sessionId !== null) {
      let parsedBody: unknown;
      if (request.method === "POST") {
        const read = await readJsonBody(request);
        if (!read.ok) return read.decision;
        parsedBody = read.body;
      }
      const found = registry.lookup(sessionId, principal);
      if (!found.ok || found.session.closing) {
        if (!found.ok && found.session) await closeSession(found.session, found.reason as CloseReason);
        log(
          `remote-mcp session rejected reason=${found.ok ? "closing" : found.reason} client=${auth.clientId}`,
        );
        return respond(404, SESSION_NOT_FOUND_BODY);
      }
      return {
        kind: "transport",
        transport: found.session.transport,
        authInfo: redactAuthInfo(auth),
        parsedBody,
        afterHandled: async () => {},
      };
    }

    // 8. No session id.
    if (request.method !== "POST") {
      return respond(400, rpcError(-32000, "Bad Request: Mcp-Session-Id header is required"));
    }
    const read = await readJsonBody(request);
    if (!read.ok) return read.decision;
    const body = read.body;
    if (Array.isArray(body) && body.some(isInitializeRequest)) {
      return respond(
        400,
        rpcError(-32600, "Invalid Request: Only one initialization request is allowed"),
      );
    }
    // A request, not merely an initialize-shaped message: the SDK's
    // InitializeRequestSchema has no id, so an id-less initialize passes
    // isInitializeRequest yet is dispatched by the SDK as a notification — it
    // would create and commit a session, then answer 202 with no session id,
    // leaving a live credential nobody can address. Found by adversarial
    // review.
    if (!isJSONRPCRequest(body) || !isInitializeRequest(body)) {
      return respond(400, rpcError(-32000, "Bad Request: Mcp-Session-Id header is required"));
    }

    // 8c. CREATE. Everything is constructed before the SDK sees the request,
    //     so an exchange failure has nothing to unwind and gets a real HTTP
    //     status rather than the SDK's generic parse error.
    await sweep();
    const slot = registry.reserve(principal);
    if (!slot.ok) {
      log(`remote-mcp session refused reason=${slot.reason} client=${auth.clientId}`);
      return respond(503, rpcError(-32000, "Too many sessions"), { "retry-after": "30" });
    }

    let exchanged: ExchangedFhirToken;
    try {
      exchanged = await withTimeout(exchange(auth.token), limits.exchangeTimeoutMs);
    } catch (error) {
      slot.release();
      // The upstream description is what an operator needs: "Invalid client"
      // is how a missing identity provider presents. It describes the server's
      // own state and carries nothing from the request. The wire gets a
      // uniform 502 — the caller's token IS valid for this resource, so a 401
      // would send a well-behaved client into a re-authorization loop that
      // cannot succeed, and a 403 would report operator misconfiguration as a
      // denial of this caller.
      log(
        `remote-mcp exchange failed client=${auth.clientId}: ${
          error instanceof TokenExchangeError
            ? error.message
            : error instanceof ExchangeTimeoutError
              ? error.message
              : "unexpected error"
        }`,
      );
      return respond(
        502,
        JSON.stringify({ error: "server_error", error_description: "FHIR token exchange failed." }),
      );
    }

    const deadline = credentialDeadline(exchanged, auth.expiresAt as number, now(), limits);
    const session: RemoteSession = {
      id: "",
      principal,
      clientId: auth.clientId,
      profile: exchanged.profile,
      createdAt: now(),
      lastSeenAt: now(),
      credentialExpiresAt: deadline,
      revoked: false,
      // Assigned below; typed non-optional so a session can never be
      // registered half-built.
      server: undefined as unknown as Server,
      transport: undefined as unknown as StreamableHTTPServerTransport,
      fhir: undefined as unknown as FhirSessionClient,
    };

    try {
      session.fhir = createFhirClient(exchanged, {
        onUnauthenticated: () => {
          session.revoked = true;
        },
      });
      // Mirrors startMcpServer exactly, with the per-caller client in place of
      // the process client. The capability gate lives inside createMcpServer
      // and is re-evaluated per request against THIS session's Server, which
      // captured THIS client's declared capabilities at initialize.
      const tools = createReadTools(session.fhir.client);
      session.server = createMcpServer(tools, {
        writeTools:
          config.writePolicy === "proposal"
            ? (liveServer) =>
                createWriteTools(
                  session.fhir.client,
                  createElicitationApproval(liveServer),
                  writeToolOptionsFromConfig(config),
                )
            : undefined,
      });
      session.transport = new StreamableHTTPServerTransport({
        sessionIdGenerator,
        // enableJsonResponse stays false: the transport's send() writes to the
        // SSE stream only when JSON mode is off, so in JSON mode the approval
        // elicitation would be silently dropped. The elicitation is tied to
        // its tools/call via relatedRequestId (request-context.ts), so it
        // rides that call's own stream rather than the optional GET stream.
        // No eventStore: nothing is replayed, nothing is retained.
        onsessioninitialized: (id) => {
          session.id = id;
          if (closed) {
            // Shutdown began while the exchange was in flight. Nothing will
            // sweep a session committed now, so refuse it instead.
            slot.release();
            void closeSession(session, "shutdown");
            return;
          }
          slot.commit(session);
          session.server.onclose = () => {
            registry.remove(id);
          };
          log(
            `remote-mcp session opened session=${shortId(id)} client=${session.clientId} profile=${
              session.profile ?? "-"
            } credential_expires_in=${Math.max(0, Math.round((deadline - now()) / 1000))}s`,
          );
        },
        onsessionclosed: () => {
          void closeSession(session, "delete");
        },
      });
      await session.server.connect(session.transport);
    } catch (error) {
      slot.release();
      try {
        session.fhir?.dispose?.();
      } catch {
        // Nothing to hold on to.
      }
      log(
        `remote-mcp session start failed client=${auth.clientId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return respond(
        500,
        JSON.stringify({ error: "server_error", error_description: "The session could not be started." }),
      );
    }
    // `exchanged` goes out of scope here; the token now exists only inside the
    // client. `auth.token` is not retained past the exchange call above.

    return {
      kind: "transport",
      transport: session.transport,
      authInfo: redactAuthInfo(auth),
      parsedBody: body,
      afterHandled: async () => {
        // The SDK awaits onsessioninitialized before dispatching initialize,
        // so if it refused the request (406/415/protocol version) no id was
        // ever assigned and nothing was committed.
        if (session.transport.sessionId === undefined) {
          slot.release();
          await closeSession(session, "init_failed");
        }
      },
    };
  }

  function inbound(req: IncomingMessage): InboundRequest {
    const headers = new Headers();
    const raw = req.rawHeaders;
    for (let i = 0; i < raw.length; i += 2) {
      try {
        headers.append(raw[i], raw[i + 1]);
      } catch {
        // An unrepresentable header name; the SDK would reject it too.
      }
    }
    return {
      method: req.method ?? "GET",
      url: new URL(req.url ?? "/", "http://placeholder.invalid"),
      headers,
      readBody: async (maxBytes) => {
        // Refuse from the declared length before reading a byte, when it is
        // declared; otherwise count as we go.
        const declared = Number(req.headers["content-length"]);
        if (Number.isFinite(declared) && declared > maxBytes) {
          return { ok: false, reason: "too_large" };
        }
        const chunks: Buffer[] = [];
        let total = 0;
        // destroyOnReturn: false — an early return from the default iterator
        // destroys the IncomingMessage and, with it, the socket, so the 413
        // written afterwards would never reach the client. The listener
        // destroys the socket itself once the response has flushed.
        for await (const chunk of req.iterator({ destroyOnReturn: false })) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
          total += buf.length;
          if (total > maxBytes) return { ok: false, reason: "too_large" };
          chunks.push(buf);
        }
        return { ok: true, text: Buffer.concat(chunks).toString("utf8") };
      },
    };
  }

  async function listener(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let decision: RemoteDecision;
    try {
      decision = await decide(inbound(req));
    } catch (error) {
      log(`remote-mcp internal error: ${error instanceof Error ? error.message : "unknown"}`);
      if (!res.headersSent) {
        res.writeHead(500, JSON_HEADERS);
        res.end(
          JSON.stringify({ error: "server_error", error_description: "Internal Server Error" }),
        );
      } else {
        res.destroy();
      }
      return;
    }

    if (decision.kind === "respond") {
      res.writeHead(decision.status, decision.headers);
      if (decision.status === 413) {
        // Do not read the rest of an oversize body.
        res.end(decision.body, () => req.destroy());
      } else {
        res.end(decision.body);
      }
      return;
    }

    stripAuthorization(req);
    (req as IncomingMessage & { auth?: AuthInfo }).auth = decision.authInfo;
    try {
      await decision.transport.handleRequest(req, res, decision.parsedBody);
    } catch (error) {
      log(`remote-mcp transport error: ${error instanceof Error ? error.message : "unknown"}`);
      if (!res.headersSent) {
        res.writeHead(500, JSON_HEADERS);
        res.end(
          JSON.stringify({ error: "server_error", error_description: "Internal Server Error" }),
        );
      } else {
        res.destroy();
      }
    } finally {
      await decision.afterHandled();
    }
  }

  return {
    paths: { mcp: paths.mcp, metadata: paths.metadata },
    registry,
    decide,
    listener,
    sweep,
    sessionCount: () => registry.size,
    close: async () => {
      closed = true;
      for (const session of registry.values()) {
        await closeSession(session, "shutdown");
      }
    },
  };
}

export async function startRemoteMcpServer(
  options: { config: McpRuntimeConfig; port?: number } & RemoteMcpDependencies,
): Promise<StartedRemoteMcpServer> {
  const { config, port, ...deps } = options;
  const handler = createRemoteMcpHandler(config, deps);
  const http = config.http as McpHttpConfig;
  const log = deps.log ?? ((line: string) => console.error(line));

  const httpServer = createServer((req, res) => {
    void handler.listener(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port ?? http.port, http.host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });
  const bound = httpServer.address();
  const address =
    bound && typeof bound === "object"
      ? { host: http.host, port: bound.port }
      : { host: http.host, port: port ?? http.port };

  const sweeper = setInterval(() => {
    void handler.sweep();
  }, SWEEP_INTERVAL_MS);
  sweeper.unref();

  log(
    `Last EHR MCP remote server ready on http://${address.host}:${address.port}${handler.paths.mcp} (resource ${http.resource}; metadata at ${handler.paths.metadata}; ${
      config.writePolicy === "proposal"
        ? "proposal-gated writes when the client supports approvals"
        : "read-only"
    }). TLS terminates in front of this process.`,
  );

  return {
    config,
    handler,
    httpServer,
    address,
    close: async () => {
      clearInterval(sweeper);
      await handler.close();
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
