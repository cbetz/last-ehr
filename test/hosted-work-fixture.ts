import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server as HttpServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

import { createHostedWorkAuth } from "../lib/work/hosted-auth";
import type { WorkAssistantContext } from "../lib/work/context";
import { DurableWorkService, type WorkCommitter, type WorkTaskRecord } from "../lib/work/service";
import { createHostedWorkServer } from "../scripts/work-hosted-server";

const syntheticContext: WorkAssistantContext = {
  patient: { reference: "Patient/hosted-synthetic-patient", label: "Alex Synthetic Worklab", dateOfBirth: "2000-01-01" },
  observation: { reference: "Observation/hosted-synthetic-result", versionId: "1", label: "Demonstration HbA1c result (synthetic)", value: 6.4, unit: "%", effectiveDateTime: "2026-01-01T12:00:00Z" },
};

async function listen(server: HttpServer, port = 0) {
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { server.off("error", reject); accept(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test listener unavailable.");
  return address.port;
}

async function closeServer(server: HttpServer) {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise<void>((accept) => server.close(() => accept()));
}

/** Actual HTTP/JWKS/OIDC test issuer. This is never evidence of Grok acceptance. */
export async function createHostedWorkFixture(options: { committer?: WorkCommitter & { readContext(): Promise<WorkAssistantContext> } } = {}) {
  if (process.env.NODE_ENV !== "test") throw new Error("The hosted Work fixture requires NODE_ENV=test.");
  const directory = await mkdtemp(join(tmpdir(), "last-hosted-work-http-"));
  await chmod(directory, 0o700);
  const keys = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(keys.publicKey), kid: "hosted-work-test-key", alg: "RS256", use: "sig" };
  const taskRecords = new Map<string, WorkTaskRecord>();
  const committer = options.committer ?? {
    readContext: async () => structuredClone(syntheticContext),
    validateContext: async ({ tenantId, patientId, source }) => tenantId === "synthetic-work-lab" && patientId === syntheticContext.patient.reference.slice("Patient/".length) && source.reference === syntheticContext.observation.reference && source.versionId === syntheticContext.observation.versionId,
    findByJobId: async ({ jobId }) => { const record = taskRecords.get(jobId); return record ? [structuredClone(record)] : []; },
    conditionalCreate: async ({ jobId, proposal }) => {
      const previous = taskRecords.get(jobId);
      if (previous) return structuredClone(previous);
      const id = `hosted-synthetic-task-${taskRecords.size + 1}`;
      const record = { id, versionId: "1", resource: { ...structuredClone(proposal), id, meta: { versionId: "1" } } };
      taskRecords.set(jobId, record);
      return structuredClone(record);
    },
  } satisfies WorkCommitter & { readContext(): Promise<WorkAssistantContext> };
  const reviewerClient = "last-reviewer-test";
  const reviewerSecret = "synthetic-fixture-client-secret-only";
  const configuredReviewer = "reviewer-person";
  let reviewerSubject = configuredReviewer;
  let origin = "";
  let issuer = "";
  type Code = { nonce: string; challenge: string; redirectUri: string; expiresAt: number };
  const codes = new Map<string, Code>();
  const idp = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
    try {
      const url = new URL(req.url || "/", issuer);
      if (req.method === "GET" && url.pathname === "/realm/jwks") return send(200, { keys: [jwk] });
      if (req.method === "GET" && url.pathname === "/realm/authorize") {
        const redirectUri = `${origin}/auth/callback`;
        const state = url.searchParams.get("state"), nonce = url.searchParams.get("nonce"), challenge = url.searchParams.get("code_challenge");
        if (url.searchParams.get("client_id") !== reviewerClient || url.searchParams.get("redirect_uri") !== redirectUri || url.searchParams.get("response_type") !== "code" || url.searchParams.get("scope") !== "openid" || url.searchParams.get("code_challenge_method") !== "S256" || !state || !nonce || !challenge || ![state, nonce, challenge].every((value) => /^[A-Za-z0-9_-]{43}$/.test(value))) return send(400, { error: "invalid_request" });
        const code = randomBytes(32).toString("base64url");
        codes.set(code, { nonce, challenge, redirectUri, expiresAt: Date.now() + 300_000 });
        const callback = new URL(redirectUri);
        callback.search = new URLSearchParams({ code, state, iss: issuer }).toString();
        res.writeHead(303, { location: callback.href, "cache-control": "no-store" }); res.end(); return;
      }
      if (req.method === "POST" && url.pathname === "/realm/token") {
        const parts: Buffer[] = []; let bytes = 0;
        for await (const chunk of req) { const value = Buffer.from(chunk); bytes += value.length; if (bytes > 8192) throw new Error("Test token body too large."); parts.push(value); }
        const body = new URLSearchParams(Buffer.concat(parts).toString("utf8"));
        const code = body.get("code") || "";
        const login = codes.get(code); codes.delete(code);
        if (!login || login.expiresAt <= Date.now() || body.get("grant_type") !== "authorization_code" || body.get("client_id") !== reviewerClient || body.get("client_secret") !== reviewerSecret || body.get("redirect_uri") !== login.redirectUri || createHash("sha256").update(body.get("code_verifier") || "").digest("base64url") !== login.challenge) return send(400, { error: "invalid_grant" });
        const at = Math.floor(Date.now() / 1000);
        const idToken = await new SignJWT({ nonce: login.nonce }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).setIssuer(issuer).setSubject(reviewerSubject).setAudience(reviewerClient).setIssuedAt(at).setExpirationTime(at + 600).sign(keys.privateKey);
        return send(200, { token_type: "Bearer", expires_in: 600, access_token: "synthetic-unused-reviewer-access-token", id_token: idToken });
      }
      send(404, { error: "not_found" });
    } catch { if (!res.headersSent) send(400, { error: "invalid_request" }); else res.end(); }
  });
  let auth: ReturnType<typeof createHostedWorkAuth> | undefined;
  let service: DurableWorkService | undefined;
  let hosted: ReturnType<typeof createHostedWorkServer> | undefined;
  let closed = false;
  const stopApplication = async () => {
    const previous = hosted; hosted = undefined;
    try { await previous?.close(); }
    finally {
      auth?.close(); auth = undefined;
      const previousService = service; service = undefined;
      previousService?.close();
    }
  };
  const close = async () => {
    if (closed) return;
    closed = true;
    try { await stopApplication(); } finally {
      try { await closeServer(idp); }
      finally { codes.clear(); await rm(directory, { force: true, recursive: true }); }
    }
  };
  const start = async () => {
    auth = createHostedWorkAuth({
      issuer, resource: `${origin}/mcp`, jwksUri: `${issuer}/jwks`, tenantId: "synthetic-work-lab",
      assistantIdentities: [{ clientId: "fixture-client-a", subject: "fixture-assistant-a" }, { clientId: "fixture-client-b", subject: "fixture-assistant-b" }],
      reviewer: { subject: configuredReviewer, clientId: reviewerClient, clientSecret: reviewerSecret, authorizationEndpoint: `${issuer}/authorize`, tokenEndpoint: `${issuer}/token`, redirectUri: `${origin}/auth/callback` },
    }, { allowInsecureLoopback: true });
    service = new DurableWorkService({ storePath: join(directory, "work.sqlite"), reviewer: auth.reviewerActor, committer });
    hosted = createHostedWorkServer({ publicOrigin: origin, issuer, auth, service, readContext: () => committer.readContext(), allowInsecureLoopback: true });
    await service.recover();
    await listen(hosted.server, Number(new URL(origin).port));
  };
  try {
    issuer = `http://127.0.0.1:${await listen(idp)}/realm`;
    const reservation = createServer();
    const port = await listen(reservation);
    await closeServer(reservation);
    origin = `http://127.0.0.1:${port}`;
    await start();
  } catch (error) { await close(); throw error; }
  return {
    origin, issuer, mcpUrl: `${origin}/mcp`, taskRecords,
    get service() { if (!service) throw new Error("Fixture service unavailable."); return service; },
    get auth() { if (!auth) throw new Error("Fixture auth unavailable."); return auth; },
    async token(identity: "a" | "b" = "a") {
      const at = Math.floor(Date.now() / 1000);
      return new SignJWT({ client_id: `fixture-client-${identity}`, scope: "work:assistant" }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).setIssuer(issuer).setSubject(`fixture-assistant-${identity}`).setAudience(`${origin}/mcp`).setIssuedAt(at).setExpirationTime(at + 600).sign(keys.privateKey);
    },
    setReviewerSubject(subject: string) { reviewerSubject = subject; },
    async restart() {
      if (closed) throw new Error("Fixture is closed.");
      await stopApplication();
      // Let clients observe closed keep-alive sockets before the same port is reused.
      await new Promise<void>((accept) => setImmediate(accept));
      await start();
    },
    close,
  };
}
