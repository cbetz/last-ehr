import { createHash } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWTVerifyGetKey } from "jose";

import { createHostedWorkAuth, HostedWorkAuthError, type HostedWorkAuthConfig } from "./hosted-auth";

const ISSUER = "https://identity.example.test/realms/work";
const RESOURCE = "https://work.example.test/mcp";
const config: HostedWorkAuthConfig = {
  issuer: ISSUER, jwksUri: "https://identity.example.test/realms/work/certs", resource: RESOURCE, tenantId: "synthetic-work-lab",
  assistantIdentities: [{ clientId: "grok-pilot", subject: "assistant-one" }, { clientId: "claude-pilot", subject: "assistant-two" }],
  reviewer: {
    subject: "reviewer-human", clientId: "last-reviewer", clientSecret: "private-client-secret",
    authorizationEndpoint: "https://identity.example.test/realms/work/authorize",
    tokenEndpoint: "https://identity.example.test/realms/work/token",
    redirectUri: "https://work.example.test/auth/callback",
  },
};
let privateKey: CryptoKey;
let foreignKey: CryptoKey;
let getKey: JWTVerifyGetKey;

beforeAll(async () => {
  const key = await generateKeyPair("RS256");
  privateKey = key.privateKey;
  foreignKey = (await generateKeyPair("RS256")).privateKey;
  getKey = createLocalJWKSet({ keys: [{ ...await exportJWK(key.publicKey), alg: "RS256", kid: "work-key" }] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

async function jwt(claims: Record<string, unknown>, key = privateKey) {
  const at = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: ISSUER, aud: RESOURCE, sub: "assistant-one", client_id: "grok-pilot", scope: "work:assistant", iat: at, exp: at + 600, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "work-key" }).sign(key);
}

function harness(input: HostedWorkAuthConfig = config) {
  let at = Date.now();
  let nextCode = 0;
  const redeemedCodes = new Set<string>();
  let response: Response | (() => Promise<Response>) = new Response("{}", { headers: { "content-type": "application/json" } });
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    void url;
    const code = new URLSearchParams(init?.body as string).get("code") || "";
    if (redeemedCodes.has(code)) return new Response('{"error":"invalid_grant"}', { status: 400, headers: { "content-type": "application/json" } });
    redeemedCodes.add(code);
    return typeof response === "function" ? response() : response;
  });
  const auth = createHostedWorkAuth(input, { getKey, fetch: fetcher, now: () => at });
  return {
    auth, fetcher, advance: (ms: number) => { at += ms; },
    respond: (value: Response | (() => Promise<Response>)) => { response = value; },
    async start(claims: Record<string, unknown> = {}) {
      const login = auth.beginReviewerLogin();
      const code = `single-use-auth-code-${++nextCode}`;
      const url = new URL(login.location);
      const idToken = await jwt({ aud: input.reviewer.clientId, sub: input.reviewer.subject, nonce: url.searchParams.get("nonce"), ...claims });
      response = new Response(JSON.stringify({ id_token: idToken, access_token: "do-not-retain-access-token", token_type: "Bearer" }), { headers: { "content-type": "application/json" } });
      return { ...login, url, idToken, code, finish: () => auth.finishReviewerLogin({ code, state: url.searchParams.get("state")!, loginCookie: login.loginCookie }) };
    },
  };
}

describe("hosted Work assistant identities", () => {
  it("binds allowed issuer/client/subject to stable opaque, distinct assistant identities", async () => {
    const { auth } = harness();
    const first = await auth.verifyAssistant(`Bearer ${await jwt({})}`);
    const renewed = await auth.verifyAssistant(`bearer ${await jwt({ exp: Math.floor(Date.now() / 1000) + 1200 })}`);
    const second = await auth.verifyAssistant(`Bearer ${await jwt({ client_id: "claude-pilot", sub: "assistant-two" })}`);
    expect(first.actor).toEqual({ tenantId: config.tenantId, role: "assistant", subject: expect.stringMatching(/^assistant:[a-f0-9]{64}$/) });
    expect(first.principal).toBe(first.actor.subject);
    expect(renewed.principal).toBe(first.principal);
    expect(second.principal).not.toBe(first.principal);
    expect(auth.reviewerActor.subject).toMatch(/^reviewer:[a-f0-9]{64}$/);
    expect(first.actor.subject).not.toBe(auth.reviewerActor.subject);
    expect(JSON.stringify(first)).not.toContain("assistant-one");
    expect(first.expiresAt).toBeGreaterThan(Date.now());
  });

  it("accepts an azp-only delegated user and preserves its actor across token renewal", async () => {
    const delegated = { clientId: "native-public-client", subject: "google-oauth2|synthetic-assistant-user" };
    const { auth, fetcher } = harness({ ...config, assistantIdentities: [...config.assistantIdentities, delegated] });
    const claims = { client_id: undefined, azp: delegated.clientId, sub: delegated.subject };
    const first = await auth.verifyAssistant(`Bearer ${await jwt(claims)}`);
    const renewed = await auth.verifyAssistant(`Bearer ${await jwt({ ...claims, exp: Math.floor(Date.now() / 1000) + 1200 })}`);
    const serviceIdentity = await auth.verifyAssistant(`Bearer ${await jwt({})}`);

    expect(first.actor).toEqual({ tenantId: config.tenantId, role: "assistant", subject: expect.stringMatching(/^assistant:[a-f0-9]{64}$/) });
    expect(renewed.actor).toEqual(first.actor);
    expect(renewed.principal).toBe(first.principal);
    expect(renewed.expiresAt).toBeGreaterThan(first.expiresAt);
    expect(first.actor.subject).not.toBe(serviceIdentity.actor.subject);
    expect(first.actor.subject).not.toBe(auth.reviewerActor.subject);
    expect(JSON.stringify(first)).not.toContain(delegated.subject);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires the delegated client's exact user and rejects the reviewer even if allowlisted", async () => {
    const delegated = { clientId: "native-public-client", subject: "google-oauth2|synthetic-assistant-user" };
    const { auth } = harness({
      ...config,
      assistantIdentities: [delegated, { clientId: delegated.clientId, subject: config.reviewer.subject }],
    });
    for (const claims of [
      { azp: delegated.clientId, sub: "google-oauth2|unlisted-user" },
      { azp: "another-public-client", sub: delegated.subject },
      { azp: delegated.clientId, sub: config.reviewer.subject },
    ]) {
      await expect(auth.verifyAssistant(`Bearer ${await jwt({ client_id: undefined, ...claims })}`)).rejects.toMatchObject({ code: "unauthorized" });
    }
  });

  it("requires exact allowlisted client and subject and work:assistant scope", async () => {
    const { auth } = harness();
    for (const claims of [{ client_id: "unregistered" }, { sub: "assistant-two" }, { scope: "chart.read" }, { scope: "" }, { sub: "" }, { sub: undefined }, { exp: undefined }]) {
      await expect(auth.verifyAssistant(`Bearer ${await jwt(claims)}`)).rejects.toMatchObject({ code: "unauthorized" });
    }
  });

  it("rejects wrong audience, issuer, signature, expired token and malformed bearer without diagnostics", async () => {
    const { auth } = harness();
    const rejected = [
      `Bearer ${await jwt({ aud: "https://api.medplum.com/" })}`,
      `Bearer ${await jwt({ iss: "https://foreign.example.test/" })}`,
      `Bearer ${await jwt({}, foreignKey)}`,
      `Bearer ${await jwt({ exp: Math.floor(Date.now() / 1000) - 10 })}`,
      undefined, "Basic private-key", "Bearer secret extra", " Bearer secret", "Bearer ",
    ];
    for (const value of rejected) {
      const error = await auth.verifyAssistant(value).catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(HostedWorkAuthError);
      expect((error as Error).message).toBe("This identity cannot access hosted Work.");
      expect((error as Error).message).not.toContain("private-key");
    }
  });

  it("refuses reviewer raw subject even when accidentally present in the assistant allowlist", async () => {
    const { auth } = harness({ ...config, assistantIdentities: [{ clientId: "grok-pilot", subject: config.reviewer.subject }] });
    await expect(auth.verifyAssistant(`Bearer ${await jwt({ sub: config.reviewer.subject })}`)).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("rechecks expiration against its clock and snapshots mutable operator configuration", async () => {
    const mutable = structuredClone(config);
    const h = harness(mutable);
    mutable.assistantIdentities[0].subject = "changed-after-start";
    const bearer = `Bearer ${await jwt({})}`;
    await expect(h.auth.verifyAssistant(bearer)).resolves.toBeDefined();
    h.advance(700_000);
    await expect(h.auth.verifyAssistant(bearer)).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("hosted Work reviewer OIDC", () => {
  it("uses PKCE, state and nonce, then keeps only an opaque bounded reviewer session", async () => {
    const h = harness();
    const login = await h.start();
    expect(login.url.origin).toBe("https://identity.example.test");
    expect(login.url.searchParams.get("response_type")).toBe("code");
    expect(login.url.searchParams.get("scope")).toBe("openid");
    expect(login.url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(login.url.searchParams.has("client_secret")).toBe(false);
    expect(login.loginCookie).toMatch(/^[A-Za-z0-9_-]{96}$/);
    const session = await login.finish();
    const [url, init] = h.fetcher.mock.calls[0];
    expect(url).toBe(config.reviewer.tokenEndpoint);
    expect(init).toMatchObject({ method: "POST", redirect: "error", credentials: "omit", cache: "no-store" });
    const body = new URLSearchParams(init?.body as string);
    expect(body.get("client_secret")).toBe(config.reviewer.clientSecret);
    expect(body.get("code")).toBe(login.code);
    expect(body.get("redirect_uri")).toBe(config.reviewer.redirectUri);
    expect(createHash("sha256").update(body.get("code_verifier")!).digest("base64url")).toBe(login.url.searchParams.get("code_challenge"));
    expect(session.actor).toEqual(h.auth.reviewerActor);
    expect(session.sessionCookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.sessionCookie).not.toBe(login.loginCookie);
    expect(session.expiresAt).toBeLessThanOrEqual((JSON.parse(Buffer.from(login.idToken.split(".")[1], "base64url").toString()) as { exp: number }).exp * 1000);
    expect(JSON.stringify(session)).not.toContain(login.idToken);
    expect(JSON.stringify(session)).not.toContain("do-not-retain-access-token");
    expect(h.auth.getReviewerSession(session.sessionCookie)).toEqual({ actor: session.actor, expiresAt: session.expiresAt });
    expect(h.auth.getReviewerSession(login.loginCookie)).toBeUndefined();
    expect(h.auth.getReviewerSession(login.idToken)).toBeUndefined();
  });

  it("supports a public OIDC client without sending a client secret", async () => {
    const h = harness({ ...config, reviewer: { ...config.reviewer, clientSecret: undefined } });
    await (await h.start()).finish();
    expect(new URLSearchParams(h.fetcher.mock.calls[0][1]?.body as string).has("client_secret")).toBe(false);
  });

  it("rejects callback state mismatch before exchange without allocating consumed-state entries", async () => {
    const h = harness();
    const login = await h.start();
    await expect(h.auth.finishReviewerLogin({ code: "code", state: "x".repeat(43), loginCookie: login.loginCookie })).rejects.toMatchObject({ code: "reviewer_login_failed" });
    expect(h.fetcher).not.toHaveBeenCalled();
    // A valid original callback still works; the HTTP route clears the browser
    // cookie after a failed callback rather than retaining server-side state.
    await expect(login.finish()).resolves.toMatchObject({ actor: h.auth.reviewerActor });
  });

  it("does not accept state from another browser login", async () => {
    const h = harness();
    const first = await h.start();
    const second = await h.start();
    await expect(h.auth.finishReviewerLogin({ code: "code", state: first.url.searchParams.get("state")!, loginCookie: second.loginCookie })).rejects.toMatchObject({ code: "reviewer_login_failed" });
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it("rejects expired login, callback replay and replay after upstream failure", async () => {
    const h = harness();
    const expired = await h.start();
    h.advance(300_001);
    await expect(expired.finish()).rejects.toMatchObject({ code: "reviewer_login_failed" });
    expect(h.fetcher).not.toHaveBeenCalled();
    const login = await h.start();
    h.respond(async () => { throw new Error("https://private.example/ client-secret raw-token"); });
    await expect(login.finish()).rejects.toThrow("Reviewer sign-in could not be verified. Start a new sign-in.");
    await expect(login.finish()).rejects.toMatchObject({ code: "reviewer_login_failed" });
    expect(h.fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects wrong signed ID token claims, absent expiry and unauthorized multi-audience party", async () => {
    const cases: Record<string, unknown>[] = [
      { sub: "someone-else", email: "reviewer@example.test", roles: ["reviewer"] },
      { aud: RESOURCE }, { iss: "https://foreign.example.test/" }, { nonce: "wrong-nonce" },
      { exp: undefined }, { exp: Math.floor(Date.now() / 1000) - 10 },
      { iat: undefined }, { iat: Math.floor(Date.now() / 1000) + 600 },
      { aud: [config.reviewer.clientId, "another-client"] }, { azp: "another-client" },
    ];
    for (const claims of cases) {
      const h = harness();
      const login = await h.start(claims);
      await expect(login.finish()).rejects.toMatchObject({ code: "reviewer_login_failed" });
      h.auth.close();
    }
  });

  it("rejects an ID token with an untrusted signature", async () => {
    const h = harness();
    const login = await h.start();
    h.respond(new Response(JSON.stringify({ id_token: await jwt({ aud: config.reviewer.clientId, sub: config.reviewer.subject, nonce: login.url.searchParams.get("nonce") }, foreignKey) }), { headers: { "content-type": "application/json" } }));
    await expect(login.finish()).rejects.toMatchObject({ code: "reviewer_login_failed" });
  });

  it("bounds session duration to one hour and invalidates expiry, logout and close", async () => {
    const h = harness();
    const before = Date.now();
    const session = await (await h.start({ exp: Math.floor(Date.now() / 1000) + 7200 })).finish();
    expect(session.expiresAt).toBeLessThanOrEqual(before + 3_600_000);
    const returned = h.auth.getReviewerSession(session.sessionCookie)!;
    returned.actor.subject = "tampered";
    expect(h.auth.getReviewerSession(session.sessionCookie)?.actor.subject).toBe(h.auth.reviewerActor.subject);
    h.advance(3_600_001);
    expect(h.auth.getReviewerSession(session.sessionCookie)).toBeUndefined();
    const next = harness();
    const logout = await (await next.start()).finish();
    next.auth.endReviewerSession(logout.sessionCookie);
    expect(next.auth.getReviewerSession(logout.sessionCookie)).toBeUndefined();
    const closed = await (await next.start()).finish();
    next.auth.close();
    expect(next.auth.getReviewerSession(closed.sessionCookie)).toBeUndefined();
    expect(() => next.auth.beginReviewerLogin()).toThrow(HostedWorkAuthError);
    await expect(next.auth.verifyAssistant(`Bearer ${await jwt({})}`)).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("allows a reviewer to finish after more than 128 anonymous login starts", async () => {
    const h = harness();
    const reviewer = await h.start();
    const anonymous = new Set<string>();
    for (let i = 0; i < 512; i++) anonymous.add(h.auth.beginReviewerLogin().loginCookie);
    expect(anonymous.size).toBe(512);
    expect(anonymous.has(reviewer.loginCookie)).toBe(false);
    await expect(reviewer.finish()).resolves.toMatchObject({ actor: h.auth.reviewerActor });
  });

  it("rejects forged, malformed and modified-expiry login cookies before token exchange", async () => {
    const h = harness();
    const login = await h.start();
    const payload = Buffer.from(login.loginCookie, "base64url");
    const entropy = Buffer.from(payload); entropy[0] ^= 1;
    const mac = Buffer.from(payload); mac[71] ^= 1;
    const expiry = Buffer.from(payload); expiry.writeBigUInt64BE(BigInt(Date.now() + 3_600_000), 32);
    for (const loginCookie of ["", "x".repeat(43), `${login.loginCookie}=`, `${login.loginCookie}\n`, "!".repeat(96), entropy.toString("base64url"), mac.toString("base64url"), expiry.toString("base64url")]) {
      await expect(h.auth.finishReviewerLogin({ code: login.code, state: login.url.searchParams.get("state")!, loginCookie })).rejects.toMatchObject({ code: "reviewer_login_failed" });
    }
    expect(h.fetcher).not.toHaveBeenCalled();
    await expect(login.finish()).resolves.toBeDefined();
  });

  it("invalidates login cookies under a new process key and when the clock exceeds their five-minute lifetime", async () => {
    const h = harness();
    const login = await h.start();
    const restarted = harness();
    await expect(restarted.auth.finishReviewerLogin({ code: login.code, state: login.url.searchParams.get("state")!, loginCookie: login.loginCookie })).rejects.toMatchObject({ code: "reviewer_login_failed" });
    expect(restarted.fetcher).not.toHaveBeenCalled();
    h.advance(300_000);
    await expect(login.finish()).rejects.toMatchObject({ code: "reviewer_login_failed" });
    expect(h.fetcher).not.toHaveBeenCalled();
    h.auth.close();
    await expect(login.finish()).rejects.toMatchObject({ code: "reviewer_login_failed" });
  });

  it("relies on one-use IdP authorization codes to reject a replayed successful callback", async () => {
    const h = harness();
    const login = await h.start();
    const session = await login.finish();
    await expect(login.finish()).rejects.toMatchObject({ code: "reviewer_login_failed" });
    expect(h.fetcher).toHaveBeenCalledTimes(2);
    expect(h.auth.getReviewerSession(session.sessionCookie)).toBeDefined();
  });

  it("rejects redirects, oversized and malformed upstream responses without exposing their contents", async () => {
    const responses = [
      new Response("private raw-token", { status: 302, headers: { location: "https://attacker.example/" } }),
      new Response("private raw-token", { headers: { "content-type": "text/plain" } }),
      new Response("invalid private raw-token", { headers: { "content-type": "application/json" } }),
      new Response("{}", { headers: { "content-type": "application/json", "content-length": "65537" } }),
      new Response("x".repeat(65537), { headers: { "content-type": "application/json" } }),
    ];
    for (const response of responses) {
      const h = harness();
      const login = await h.start();
      h.respond(response);
      await expect(login.finish()).rejects.toThrow("Reviewer sign-in could not be verified. Start a new sign-in.");
      h.auth.close();
    }
  });

  it("times out an unresponsive token endpoint and does not permit callback replay", async () => {
    const h = harness();
    const login = await h.start();
    vi.useFakeTimers();
    h.respond(() => new Promise<Response>(() => {}));
    const result = login.finish().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await result).toMatchObject({ code: "reviewer_login_failed" });
    await expect(login.finish()).rejects.toMatchObject({ code: "reviewer_login_failed" });
    expect(h.fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("hosted Work authentication configuration", () => {
  it("requires HTTPS and explicit safe operator identities", () => {
    for (const change of [
      { issuer: "http://identity.example.test/" }, { jwksUri: "https://user:secret@identity.example.test/jwks" },
      { resource: `${RESOURCE}?token=secret` }, { assistantIdentities: [] },
      { assistantIdentities: [config.assistantIdentities[0], config.assistantIdentities[0]] },
      { tenantId: "bad tenant" },
    ]) expect(() => createHostedWorkAuth({ ...config, ...change }, { getKey })).toThrow("Hosted Work authentication configuration is invalid.");
  });

  it("permits exact numeric loopback HTTP only with both test guards", () => {
    const local = { ...config, issuer: "http://127.0.0.1:5555/realm", jwksUri: "http://127.0.0.1:5555/jwks" };
    expect(() => createHostedWorkAuth(local, { getKey })).toThrow(HostedWorkAuthError);
    vi.stubEnv("NODE_ENV", "test");
    expect(() => createHostedWorkAuth(local, { getKey, allowInsecureLoopback: true })).not.toThrow();
    expect(() => createHostedWorkAuth({ ...local, issuer: "http://localhost:5555/realm" }, { getKey, allowInsecureLoopback: true })).toThrow(HostedWorkAuthError);
    expect(() => createHostedWorkAuth({ ...local, issuer: "http://2130706433:5555/realm" }, { getKey, allowInsecureLoopback: true })).toThrow(HostedWorkAuthError);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createHostedWorkAuth(local, { getKey, allowInsecureLoopback: true })).toThrow(HostedWorkAuthError);
  });
});
