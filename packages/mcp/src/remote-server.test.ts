import { describe, it, expect, vi, type Mock } from "vitest";
import {
  InsufficientScopeError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { OAuthProtectedResourceMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { UnsecuredJWT } from "jose";

import { McpConfigurationError, type McpRuntimeConfig } from "./config.js";
import {
  DEFAULT_REMOTE_SESSION_LIMITS,
  RemoteSessionRegistry,
  assertBindIsSafe,
  authenticateBearer,
  createRemoteMcpHandler,
  credentialDeadline,
  fhirBaseUrlFor,
  oauthChallenge,
  protectedResourceMetadataUrl,
  redactAuthInfo,
  remoteMcpPaths,
  sanitizeChallengeText,
  sessionPrincipal,
  stripAuthorization,
  type InboundRequest,
  type RemoteSession,
} from "./remote-server.js";
import { TokenExchangeError, type ExchangedFhirToken } from "./token-exchange.js";
import type { FhirWriteClient } from "./write-tools.js";

// No sockets anywhere in this file. Every case goes through decide() with a
// literal InboundRequest, a table-backed verifier, a recording exchange, an
// in-memory client factory, and an injected clock.

const RESOURCE = "https://mcp.example.test/mcp";
const ISSUER = "https://auth.example.test/";
const TOKEN_ENDPOINT = "https://fhir.example.test/oauth2/token";
const METADATA_URL = "https://mcp.example.test/.well-known/oauth-protected-resource/mcp";
const CALLER_TOKEN = "caller-secret-must-never-appear";

const CONFIG: McpRuntimeConfig = {
  backend: "medplum",
  writePolicy: "read-only",
  writeProvenance: false,
  disabledWriteTools: [],
  transport: "http",
  http: {
    port: 3400,
    host: "127.0.0.1",
    resource: RESOURCE,
    issuer: ISSUER,
    jwksUri: "https://auth.example.test/.well-known/jwks.json",
    requiredScopes: ["chart.read"],
    exchangeClientId: "client-with-idp",
    tokenEndpoint: TOKEN_ENDPOINT,
  },
};

let clock = 1_800_000_000_000;
const now = () => clock;

function authInfo(over: Partial<AuthInfo> & { sub?: string | null } = {}): AuthInfo {
  const { sub = "user-9", ...rest } = over;
  return {
    token: CALLER_TOKEN,
    clientId: "agent-1",
    scopes: ["chart.read"],
    expiresAt: Math.floor(clock / 1000) + 3600,
    resource: new URL(RESOURCE),
    extra: { issuer: ISSUER, subject: sub === null ? undefined : sub },
    ...rest,
  };
}

/** A verifier backed by a token -> AuthInfo (or thrown error) table. */
function tableVerifier(table: Record<string, AuthInfo | Error>) {
  const verify = vi.fn(async (token: string) => {
    const entry = table[token];
    if (!entry) throw new InvalidTokenError("Token rejected: unknown test token");
    if (entry instanceof Error) throw entry;
    return entry;
  });
  return { verifyAccessToken: verify, calls: verify };
}

function inbound(over: {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: string;
}): InboundRequest {
  const text = over.body ?? "";
  return {
    method: over.method ?? "POST",
    url: new URL(over.path ?? "/mcp", "http://placeholder.invalid"),
    headers: new Headers(over.headers ?? {}),
    readBody: async (max) =>
      Buffer.byteLength(text) > max
        ? { ok: false, reason: "too_large" }
        : { ok: true, text },
  };
}

const INIT_BODY = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "t", version: "0" },
  },
});

function inMemoryClient(): { client: FhirWriteClient; dispose: Mock<() => void> } {
  const created: unknown[] = [];
  return {
    dispose: vi.fn<() => void>(),
    client: {
      async search() {
        return { resourceType: "Bundle", type: "searchset" } as never;
      },
      async searchResources() {
        return [] as never;
      },
      async createResource(resource) {
        const stored = { ...resource, id: `created-${created.length + 1}` };
        created.push(stored);
        return stored;
      },
    },
  };
}

function makeHandler(over: {
  verifier?: ReturnType<typeof tableVerifier>;
  exchange?: (t: string) => Promise<ExchangedFhirToken>;
  config?: McpRuntimeConfig;
  limits?: Partial<typeof DEFAULT_REMOTE_SESSION_LIMITS>;
  factory?: () => { client: FhirWriteClient; dispose?: () => void };
} = {}) {
  const verifier = over.verifier ?? tableVerifier({ [CALLER_TOKEN]: authInfo() });
  const exchange = vi.fn(
    over.exchange ??
      (async () => ({
        accessToken: "fhir-for-user-9",
        expiresAt: Math.floor(clock / 1000) + 3600,
        profile: "Practitioner/p1",
      })),
  );
  const log: string[] = [];
  const disposals: Mock<() => void>[] = [];
  const handler = createRemoteMcpHandler(over.config ?? CONFIG, {
    verifier,
    exchange,
    fetchImpl: async () => {
      throw new Error("network reached");
    },
    createFhirClient: () => {
      if (over.factory) return over.factory();
      const c = inMemoryClient();
      disposals.push(c.dispose);
      return c;
    },
    now,
    sessionIdGenerator: (() => {
      let n = 0;
      return () => `s-${++n}`;
    })(),
    log: (line) => log.push(line),
    limits: over.limits,
  });
  return { handler, verifier, exchange, log, disposals };
}

const authed = (extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${CALLER_TOKEN}`,
  ...extra,
});

describe("routing", () => {
  it("derives the MCP path and the RFC 9728 metadata path from the one resource", () => {
    expect(remoteMcpPaths("https://mcp.example.test/mcp")).toEqual({
      mcp: "/mcp",
      metadata: "/.well-known/oauth-protected-resource/mcp",
      metadataUrl: METADATA_URL,
    });
    expect(remoteMcpPaths("https://mcp.example.test/")).toMatchObject({
      mcp: "/",
      metadata: "/.well-known/oauth-protected-resource",
    });
    // The identifier IS the endpoint; a trailing slash is kept, not guessed away.
    expect(remoteMcpPaths("https://mcp.example.test/mcp/")).toMatchObject({
      mcp: "/mcp/",
      metadata: "/.well-known/oauth-protected-resource/mcp/",
    });
  });

  it("matches the SDK's metadata URL rule, which is not imported at runtime", () => {
    // server/auth/router.js imports express at module load, so the module
    // reproduces its 3-line rule and this test pins the two together.
    for (const r of [
      "https://mcp.example.test/mcp",
      "https://mcp.example.test/",
      "https://mcp.example.test/mcp/",
      "https://mcp.example.test:8443/a/b",
    ]) {
      expect(protectedResourceMetadataUrl(new URL(r))).toBe(
        getOAuthProtectedResourceMetadataUrl(new URL(r)),
      );
    }
  });

  it("answers 404 for an unknown path without consulting the verifier", async () => {
    const { handler, verifier } = makeHandler();
    const d = await handler.decide(inbound({ path: "/health", method: "GET" }));
    expect(d).toMatchObject({ kind: "respond", status: 404 });
    expect(verifier.calls).not.toHaveBeenCalled();
  });

  it("serves the metadata document unauthenticated, GET only", async () => {
    const { handler, verifier } = makeHandler();
    const d = await handler.decide(
      inbound({ path: "/.well-known/oauth-protected-resource/mcp", method: "GET" }),
    );
    expect(d.kind).toBe("respond");
    if (d.kind !== "respond") return;
    expect(d.status).toBe(200);
    expect(d.headers["cache-control"]).toBe("public, max-age=3600");
    const parsed = OAuthProtectedResourceMetadataSchema.safeParse(JSON.parse(d.body));
    expect(parsed.success).toBe(true);
    expect(JSON.parse(d.body)).toMatchObject({
      resource: RESOURCE,
      authorization_servers: [ISSUER],
      scopes_supported: ["chart.read"],
    });
    expect(verifier.calls).not.toHaveBeenCalled();

    const post = await handler.decide(
      inbound({ path: "/.well-known/oauth-protected-resource/mcp", method: "POST" }),
    );
    expect(post).toMatchObject({ kind: "respond", status: 405, headers: { allow: "GET" } });
  });
});

describe("bearer gate", () => {
  it("answers 401 with resource_metadata for a missing header and creates nothing", async () => {
    const { handler, exchange } = makeHandler();
    const d = await handler.decide(inbound({ body: INIT_BODY }));
    expect(d).toMatchObject({ kind: "respond", status: 401 });
    if (d.kind !== "respond") return;
    expect(d.headers["www-authenticate"]).toContain(`resource_metadata="${METADATA_URL}"`);
    expect(d.headers["www-authenticate"]).toContain('error="invalid_token"');
    expect(exchange).not.toHaveBeenCalled();
    expect(handler.registry.size).toBe(0);
  });

  it.each([
    ["Basic abc", "non-Bearer scheme"],
    ["Bearer", "empty Bearer value"],
    ["Bearer a b", "three-part header"],
  ])("answers 401 for %s (%s)", async (header) => {
    const { handler } = makeHandler();
    const d = await handler.decide(inbound({ headers: { authorization: header }, body: INIT_BODY }));
    expect(d).toMatchObject({ kind: "respond", status: 401 });
  });

  it("maps InsufficientScopeError to 403 carrying the required scope", async () => {
    const { handler } = makeHandler({
      verifier: tableVerifier({
        [CALLER_TOKEN]: new InsufficientScopeError("Token is missing required scope(s): chart.read."),
      }),
    });
    const d = await handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
    expect(d).toMatchObject({ kind: "respond", status: 403 });
    if (d.kind !== "respond") return;
    expect(d.headers["www-authenticate"]).toContain('error="insufficient_scope"');
    expect(d.headers["www-authenticate"]).toContain('scope="chart.read"');
  });

  it("maps any other verifier failure to 500 with no challenge and no detail on the wire", async () => {
    const { handler, log } = makeHandler({
      verifier: tableVerifier({ [CALLER_TOKEN]: new Error("JWKS fetch failed: https://internal/jwks") }),
    });
    const d = await handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
    expect(d).toMatchObject({ kind: "respond", status: 500 });
    if (d.kind !== "respond") return;
    expect(d.headers["www-authenticate"]).toBeUndefined();
    expect(d.body).not.toContain("internal");
    expect(log.join("\n")).toContain("JWKS fetch failed");
  });

  it("rejects a verified token with no expiry, or one past expiry on the injected clock", async () => {
    await expect(
      authenticateBearer(
        `Bearer ${CALLER_TOKEN}`,
        tableVerifier({ [CALLER_TOKEN]: authInfo({ expiresAt: undefined }) }),
        now(),
      ),
    ).rejects.toThrow(/no expiration time/);
    await expect(
      authenticateBearer(
        `Bearer ${CALLER_TOKEN}`,
        tableVerifier({ [CALLER_TOKEN]: authInfo({ expiresAt: Math.floor(clock / 1000) - 1 }) }),
        now(),
      ),
    ).rejects.toThrow(/has expired/);
  });

  it("rejects a token with no subject before any exchange", async () => {
    // A session is bound to the caller who opened it; a caller the token
    // cannot name cannot be bound.
    const { handler, exchange } = makeHandler({
      verifier: tableVerifier({ [CALLER_TOKEN]: authInfo({ sub: null }) }),
    });
    const d = await handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
    expect(d).toMatchObject({ kind: "respond", status: 401 });
    if (d.kind !== "respond") return;
    expect(d.body).toContain("identifies no subject");
    expect(exchange).not.toHaveBeenCalled();
  });

  it("sanitises quotes so WWW-Authenticate still parses", () => {
    // oauth-verifier forwards jose text such as `"exp" claim timestamp check
    // failed`, whose quotes would end the RFC 7235 quoted-string early.
    const c = oauthChallenge(
      new InvalidTokenError('Token rejected: "exp" claim timestamp check failed'),
      { resourceMetadataUrl: METADATA_URL, requiredScopes: ["chart.read"] },
    );
    expect(c.status).toBe(401);
    expect(c.headers["www-authenticate"]).toMatch(
      /^Bearer error="invalid_token", error_description="([^"]*)", scope="chart\.read", resource_metadata="https:\/\/mcp\.example\.test\/\.well-known\/oauth-protected-resource\/mcp"$/,
    );
    expect(c.headers["www-authenticate"]).toContain("'exp' claim");
    expect(sanitizeChallengeText('a"b\\cd')).toBe("a'b'cd");
  });

  it("runs the bearer check before the method check", async () => {
    const { handler } = makeHandler();
    const noToken = await handler.decide(inbound({ method: "PUT" }));
    expect(noToken).toMatchObject({ kind: "respond", status: 401 });
    const withToken = await handler.decide(inbound({ method: "PUT", headers: authed() }));
    expect(withToken).toMatchObject({
      kind: "respond",
      status: 405,
      headers: { allow: "GET, POST, DELETE" },
    });
  });
});

describe("opening a session", () => {
  it("exchanges the caller token exactly once and builds the client from the result", async () => {
    let received: ExchangedFhirToken | undefined;
    const { handler, exchange } = makeHandler({
      factory: () => inMemoryClient(),
    });
    // Reach into the factory via a fresh handler so we can capture the input.
    const captured = createRemoteMcpHandler(CONFIG, {
      verifier: tableVerifier({ [CALLER_TOKEN]: authInfo() }),
      exchange: async () => ({ accessToken: "fhir-for-user-9", expiresAt: Math.floor(clock / 1000) + 60 }),
      fetchImpl: async () => {
        throw new Error("network reached");
      },
      createFhirClient: (ex) => {
        received = ex;
        return inMemoryClient();
      },
      now,
      log: () => {},
    });
    const d = await captured.decide(inbound({ headers: authed(), body: INIT_BODY }));
    expect(d.kind).toBe("transport");
    if (d.kind !== "transport") return;
    expect(received?.accessToken).toBe("fhir-for-user-9");
    // The transport sees who the caller is, never what they presented.
    expect(d.authInfo.token).toBe("");
    expect(d.authInfo.clientId).toBe("agent-1");
    expect(d.parsedBody).toEqual(JSON.parse(INIT_BODY));
    await d.afterHandled();

    const d2 = await handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
    if (d2.kind === "transport") await d2.afterHandled();
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange.mock.calls[0][0]).toBe(CALLER_TOKEN);
  });

  it("requires a session id for anything that is not a lone initialize, with no exchange", async () => {
    const { handler, exchange } = makeHandler();
    const list = await handler.decide(
      inbound({
        headers: authed(),
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      }),
    );
    expect(list).toMatchObject({ kind: "respond", status: 400 });
    for (const method of ["GET", "DELETE"]) {
      const d = await handler.decide(inbound({ method, headers: authed() }));
      expect(d).toMatchObject({ kind: "respond", status: 400 });
    }
    const batch = await handler.decide(
      inbound({ headers: authed(), body: `[${INIT_BODY}]` }),
    );
    expect(batch).toMatchObject({ kind: "respond", status: 400 });
    if (batch.kind === "respond") expect(batch.body).toContain("Only one initialization request");
    expect(exchange).not.toHaveBeenCalled();
  });

  it("turns every exchange failure into 502 with no challenge and no session", async () => {
    const failures: Array<() => Promise<ExchangedFhirToken>> = [
      async () => {
        throw new TokenExchangeError(
          "Token exchange rejected (HTTP 400): invalid_request: Invalid client",
          400,
        );
      },
      async () => {
        throw new TokenExchangeError("Token exchange could not reach the authorization server: ECONNREFUSED");
      },
      async () => {
        throw new TokenExchangeError("Token exchange rejected (HTTP 502).", 502);
      },
      async () => {
        throw new Error("unexpected");
      },
    ];
    const bodies = new Set<string>();
    for (const exchange of failures) {
      const { handler, log } = makeHandler({ exchange });
      const d = await handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
      expect(d).toMatchObject({ kind: "respond", status: 502 });
      if (d.kind !== "respond") continue;
      expect(d.headers["www-authenticate"]).toBeUndefined();
      bodies.add(d.body);
      expect(handler.registry.size).toBe(0);
      expect(log.join("\n")).not.toContain(CALLER_TOKEN);
    }
    expect(bodies.size).toBe(1);
  });

  it("surfaces the upstream 'Invalid client' detail in the log, which operators need", async () => {
    const { handler, log } = makeHandler({
      exchange: async () => {
        throw new TokenExchangeError(
          "Token exchange rejected (HTTP 400): invalid_request: Invalid client",
          400,
        );
      },
    });
    await handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
    expect(log.join("\n")).toContain("Invalid client");
  });

  it("answers 413 for an oversize body and 400 for a body that is not JSON, with no exchange", async () => {
    const { handler, exchange } = makeHandler({ limits: { maxBodyBytes: 32 } });
    const big = await handler.decide(inbound({ headers: authed(), body: "x".repeat(64) }));
    expect(big).toMatchObject({ kind: "respond", status: 413, headers: { connection: "close" } });
    const bad = await handler.decide(inbound({ headers: authed(), body: "{not json" }));
    expect(bad).toMatchObject({ kind: "respond", status: 400 });
    if (bad.kind === "respond") expect(bad.body).toContain("Parse error");
    expect(exchange).not.toHaveBeenCalled();
  });

  it("answers 500 and releases the slot when the client factory throws", async () => {
    let calls = 0;
    const { handler } = makeHandler({
      limits: { maxSessionsPerPrincipal: 1 },
      factory: () => {
        if (calls++ === 0) throw new Error("factory down");
        return inMemoryClient();
      },
    });
    const first = await handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
    expect(first).toMatchObject({ kind: "respond", status: 500 });
    // The slot was released, so the same principal can try again.
    const second = await handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
    expect(second.kind).toBe("transport");
    if (second.kind === "transport") await second.afterHandled();
  });
});

describe("credential deadline", () => {
  const limits = DEFAULT_REMOTE_SESSION_LIMITS;
  const callerExp = Math.floor(clock / 1000) + 7200;

  it("uses expires_in when reported, minus the skew", () => {
    const exp = Math.floor(clock / 1000) + 600;
    expect(credentialDeadline({ accessToken: "opaque", expiresAt: exp }, callerExp, clock, limits)).toBe(
      exp * 1000 - limits.expirySkewMs,
    );
  });

  it("falls back to the exchanged JWT's exp", () => {
    const exp = Math.floor(clock / 1000) + 900;
    const jwt = new UnsecuredJWT({}).setExpirationTime(exp).encode();
    expect(credentialDeadline({ accessToken: jwt }, callerExp, clock, limits)).toBe(
      exp * 1000 - limits.expirySkewMs,
    );
  });

  it("falls back to min(caller exp, fixed ceiling) for an opaque token with no expiry", () => {
    const ceiling = clock + limits.fallbackCredentialTtlMs;
    expect(credentialDeadline({ accessToken: "opaque" }, callerExp, clock, limits)).toBe(
      Math.min(callerExp * 1000, ceiling) - limits.expirySkewMs,
    );
    const shortCaller = Math.floor(clock / 1000) + 60;
    expect(credentialDeadline({ accessToken: "opaque" }, shortCaller, clock, limits)).toBe(
      shortCaller * 1000 - limits.expirySkewMs,
    );
  });
});

describe("session registry", () => {
  function session(over: Partial<RemoteSession> = {}): RemoteSession {
    return {
      id: over.id ?? "s-1",
      principal: over.principal ?? sessionPrincipal(authInfo()),
      clientId: "agent-1",
      createdAt: clock,
      lastSeenAt: clock,
      credentialExpiresAt: clock + 60_000,
      revoked: false,
      server: { close: vi.fn(async () => {}) } as never,
      transport: { closeStandaloneSSEStream: vi.fn() } as never,
      fhir: { client: inMemoryClient().client, dispose: vi.fn() },
      ...over,
    };
  }

  it("binds the principal to issuer, client id, and subject, ignoring token text and scopes", () => {
    const a = sessionPrincipal(authInfo());
    expect(sessionPrincipal(authInfo({ token: "other", scopes: ["x", "y"], expiresAt: 1 }))).toBe(a);
    expect(sessionPrincipal(authInfo({ sub: "user-10" }))).not.toBe(a);
    expect(sessionPrincipal(authInfo({ clientId: "agent-2" }))).not.toBe(a);
  });

  it("reports a foreign principal without touching the session", () => {
    const registry = new RemoteSessionRegistry(DEFAULT_REMOTE_SESSION_LIMITS, now);
    const slot = registry.reserve(sessionPrincipal(authInfo()));
    expect(slot.ok).toBe(true);
    if (!slot.ok) return;
    const s = session();
    slot.commit(s);
    const before = s.lastSeenAt;
    clock += 1000;
    const foreign = registry.lookup("s-1", sessionPrincipal(authInfo({ sub: "user-10" })));
    expect(foreign).toEqual({ ok: false, reason: "foreign" });
    expect(s.lastSeenAt).toBe(before);
    expect(registry.lookup("nope", sessionPrincipal(authInfo()))).toEqual({
      ok: false,
      reason: "unknown",
    });
  });

  it("reports expired, revoked, and idle, and touches lastSeenAt only on success", () => {
    const registry = new RemoteSessionRegistry(
      { ...DEFAULT_REMOTE_SESSION_LIMITS, idleTimeoutMs: 1000 },
      now,
    );
    const principal = sessionPrincipal(authInfo());
    const ok = session({ id: "ok" });
    const expired = session({ id: "expired", credentialExpiresAt: clock - 1 });
    const revoked = session({ id: "revoked", revoked: true });
    const idle = session({ id: "idle", lastSeenAt: clock - 5000 });
    for (const s of [ok, expired, revoked, idle]) {
      const slot = registry.reserve(principal);
      if (slot.ok) slot.commit(s);
    }
    expect(registry.lookup("expired", principal)).toMatchObject({ ok: false, reason: "expired" });
    expect(registry.lookup("revoked", principal)).toMatchObject({ ok: false, reason: "revoked" });
    expect(registry.lookup("idle", principal)).toMatchObject({ ok: false, reason: "idle" });
    clock += 10;
    expect(registry.lookup("ok", principal)).toMatchObject({ ok: true });
    expect(ok.lastSeenAt).toBe(clock);
    expect(registry.stale().map((s) => s.reason).sort()).toEqual(["expired", "idle", "revoked"]);
  });

  it("holds capacity as a hard bound while reservations are pending", () => {
    const registry = new RemoteSessionRegistry(
      { ...DEFAULT_REMOTE_SESSION_LIMITS, maxSessions: 2, maxSessionsPerPrincipal: 1 },
      now,
    );
    const a = sessionPrincipal(authInfo({ sub: "a" }));
    const b = sessionPrincipal(authInfo({ sub: "b" }));
    const c = sessionPrincipal(authInfo({ sub: "c" }));
    const slotA = registry.reserve(a);
    expect(slotA.ok).toBe(true);
    // Same principal again, still pending: refused.
    expect(registry.reserve(a)).toEqual({ ok: false, reason: "principal_limit" });
    const slotB = registry.reserve(b);
    expect(slotB.ok).toBe(true);
    // Two pending fills capacity 2 before either committed.
    expect(registry.reserve(c)).toEqual({ ok: false, reason: "capacity" });
    // Release frees the slot; commit and release are idempotent.
    if (slotB.ok) {
      slotB.release();
      slotB.release();
    }
    expect(registry.reserve(c).ok).toBe(true);
    if (slotA.ok) {
      slotA.commit(session({ id: "a", principal: a }));
      slotA.commit(session({ id: "a-again", principal: a }));
    }
    expect(registry.size).toBe(1);
  });
});

describe("redaction", () => {
  it("hands the transport an AuthInfo with an empty token", () => {
    const redacted = redactAuthInfo(authInfo());
    expect(redacted.token).toBe("");
    expect(redacted.clientId).toBe("agent-1");
  });

  it("strips Authorization from both rawHeaders and headers", () => {
    // @hono/node-server builds the web Headers from rawHeaders, so deleting
    // headers.authorization alone would leave the bearer reachable.
    const req = {
      rawHeaders: ["Host", "x", "Authorization", `Bearer ${CALLER_TOKEN}`, "Accept", "*/*"],
      headers: { host: "x", authorization: `Bearer ${CALLER_TOKEN}`, accept: "*/*" },
    } as never;
    stripAuthorization(req);
    expect((req as { rawHeaders: string[] }).rawHeaders).toEqual(["Host", "x", "Accept", "*/*"]);
    expect((req as { headers: Record<string, string> }).headers.authorization).toBeUndefined();
    expect((req as { headers: Record<string, string> }).headers.accept).toBe("*/*");
  });
});

describe("configuration guards", () => {
  it("refuses a stdio configuration", () => {
    expect(() =>
      createRemoteMcpHandler({ ...CONFIG, transport: "stdio", http: undefined }),
    ).toThrow(McpConfigurationError);
  });

  it("refuses a non-loopback bind with a non-https resource", () => {
    expect(() =>
      assertBindIsSafe({ ...CONFIG.http!, host: "0.0.0.0", resource: "http://mcp.example.test/mcp" }),
    ).toThrow(/plaintext/);
    expect(() => assertBindIsSafe({ ...CONFIG.http!, host: "0.0.0.0" })).not.toThrow();
    expect(() =>
      assertBindIsSafe({ ...CONFIG.http!, host: "127.0.0.1", resource: "http://localhost/mcp" }),
    ).not.toThrow();
  });

  it("derives the FHIR base URL from the token endpoint and never from api.medplum.com", () => {
    const http = CONFIG.http!;
    expect(fhirBaseUrlFor({ ...CONFIG, http })).toBe("https://fhir.example.test/");
    expect(fhirBaseUrlFor({ ...CONFIG, http, baseUrl: "https://fhir.example.test/fhir/R4/" })).toBe(
      "https://fhir.example.test/fhir/R4/",
    );
    expect(() =>
      fhirBaseUrlFor({ ...CONFIG, http, baseUrl: "https://api.medplum.com/" }),
    ).toThrow(/share an origin/);
  });
});

describe("no token leaves the process on any rejecting path", () => {
  it("keeps the caller token and any exchanged token out of every body, header, and log line", async () => {
    const outputs: string[] = [];
    const cases: Array<() => Promise<void>> = [
      async () => {
        const { handler, log } = makeHandler();
        const d = await handler.decide(inbound({ body: INIT_BODY }));
        outputs.push(JSON.stringify(d), ...log);
      },
      async () => {
        const { handler, log } = makeHandler({
          exchange: async () => {
            throw new TokenExchangeError("Token exchange rejected (HTTP 400): invalid_request: Invalid client", 400);
          },
        });
        const d = await handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
        outputs.push(JSON.stringify(d), ...log);
      },
      async () => {
        const { handler, log } = makeHandler({
          verifier: tableVerifier({ [CALLER_TOKEN]: new Error("verifier crashed") }),
        });
        const d = await handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
        outputs.push(JSON.stringify(d), ...log);
      },
      async () => {
        const { handler, log } = makeHandler();
        const d = await handler.decide(
          inbound({ headers: authed({ "mcp-session-id": "someone-elses" }), body: "{}" }),
        );
        outputs.push(JSON.stringify(d), ...log);
      },
    ];
    for (const run of cases) await run();
    const all = outputs.join("\n");
    expect(all).not.toContain(CALLER_TOKEN);
    expect(all).not.toContain("fhir-for-");
    expect(all.length).toBeGreaterThan(0);
  });
});

/** A committed-shaped session for registry-level cases. */
function fakeSession(id: string, principal: string, over: Partial<RemoteSession> = {}): RemoteSession {
  return {
    id,
    principal,
    clientId: "agent-1",
    createdAt: clock,
    lastSeenAt: clock,
    credentialExpiresAt: clock + 60_000,
    revoked: false,
    server: { close: vi.fn(async () => {}) } as never,
    transport: {} as never,
    fhir: { client: inMemoryClient().client, dispose: vi.fn() },
    ...over,
  };
}

describe("review hardening", () => {
  // An id-less initialize passes the SDK's isInitializeRequest (its schema has
  // no id) but is dispatched as a notification: the SDK would generate a
  // session id, await our commit, then answer 202 with no id, leaving a live
  // credential nobody can address.
  it("refuses an id-less initialize before any exchange or reservation", async () => {
    const { handler, exchange } = makeHandler();
    const idless = JSON.stringify({
      jsonrpc: "2.0",
      method: "initialize",
      params: JSON.parse(INIT_BODY).params,
    });
    const d = await handler.decide(inbound({ headers: authed(), body: idless }));
    expect(d).toMatchObject({ kind: "respond", status: 400 });
    expect(exchange).not.toHaveBeenCalled();
    expect(handler.registry.reserved).toBe(0);
  });

  // Capacity is a hard bound that never evicts, so a leaked reservation is a
  // permanent loss. registry.size excludes pending slots; reserved does not.
  it("releases the reservation on every failed open", async () => {
    const onExchange = makeHandler({
      exchange: async () => {
        throw new TokenExchangeError("Token exchange rejected (HTTP 400): invalid_request: Invalid client", 400);
      },
    });
    await onExchange.handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
    expect(onExchange.handler.registry.reserved).toBe(0);

    const onFactory = makeHandler({
      factory: () => {
        throw new Error("factory down");
      },
    });
    await onFactory.handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
    expect(onFactory.handler.registry.reserved).toBe(0);

    // The SDK refusing the initialize (406/415): no id is ever assigned, and
    // afterHandled must release the slot and dispose the client.
    const onRefusal = makeHandler();
    const d = await onRefusal.handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
    expect(d.kind).toBe("transport");
    expect(onRefusal.handler.registry.reserved).toBe(1);
    if (d.kind === "transport") await d.afterHandled();
    expect(onRefusal.handler.registry.reserved).toBe(0);
    expect(onRefusal.disposals).toHaveLength(1);
    expect(onRefusal.disposals[0]).toHaveBeenCalledTimes(1);
    expect(onRefusal.log.join("\n")).toContain("reason=init_failed");
  });

  it("times out a stalled exchange with 502 and frees the reservation", async () => {
    const { handler, log } = makeHandler({
      exchange: () => new Promise<never>(() => {}),
      limits: { exchangeTimeoutMs: 20 },
    });
    const d = await handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
    expect(d).toMatchObject({ kind: "respond", status: 502 });
    expect(handler.registry.reserved).toBe(0);
    expect(log.join("\n")).toContain("did not complete within");
  });

  it("caps the body on the session path too, and never hands over the transport", async () => {
    const { handler } = makeHandler({ limits: { maxBodyBytes: 32 } });
    const principal = sessionPrincipal(authInfo());
    const slot = handler.registry.reserve(principal);
    if (!slot.ok) throw new Error("reserve failed");
    slot.commit(fakeSession("s-x", principal));
    const d = await handler.decide(
      inbound({ headers: authed({ "mcp-session-id": "s-x" }), body: "x".repeat(64) }),
    );
    expect(d).toMatchObject({ kind: "respond", status: 413, headers: { connection: "close" } });
  });

  it("answers 404 for a session that is already closing, even to its owner", async () => {
    const { handler } = makeHandler();
    const principal = sessionPrincipal(authInfo());
    const slot = handler.registry.reserve(principal);
    if (!slot.ok) throw new Error("reserve failed");
    slot.commit(fakeSession("s-c", principal, { closing: Promise.resolve() }));
    const d = await handler.decide(
      inbound({ headers: authed({ "mcp-session-id": "s-c" }), body: "{}" }),
    );
    expect(d).toMatchObject({ kind: "respond", status: 404 });
  });

  it("refuses new work once close() has begun", async () => {
    const { handler, exchange } = makeHandler();
    await handler.close();
    const d = await handler.decide(inbound({ headers: authed(), body: INIT_BODY }));
    expect(d).toMatchObject({ kind: "respond", status: 503 });
    expect(exchange).not.toHaveBeenCalled();
  });

  it("treats a duplicate session id as an invariant violation, not an overwrite", () => {
    const registry = new RemoteSessionRegistry(DEFAULT_REMOTE_SESSION_LIMITS, now);
    const principal = sessionPrincipal(authInfo());
    const first = registry.reserve(principal);
    if (!first.ok) throw new Error("reserve failed");
    first.commit(fakeSession("dup", principal));
    const second = registry.reserve(principal);
    if (!second.ok) throw new Error("reserve failed");
    expect(() => second.commit(fakeSession("dup", principal))).toThrow(/Duplicate session id/);
    expect(registry.size).toBe(1);
    // The failed commit released its pending slot rather than leaking it.
    expect(registry.reserved).toBe(1);
  });
});
