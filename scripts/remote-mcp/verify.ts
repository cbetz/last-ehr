import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ElicitRequestSchema, LATEST_PROTOCOL_VERSION, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { decodeJwt } from "jose";

import { loadMcpConfig } from "../../packages/mcp/src/config";
import { READ_TOOL_NAMES } from "../../packages/mcp/src/read-tools";
import { startRemoteMcpServer, type StartedRemoteMcpServer } from "../../packages/mcp/src/remote-server";
import { AIAST_LABEL, MCP_WRITE_TAG, WRITE_TOOL_NAMES } from "../../packages/mcp/src/write-tools";
import type { MedplumFixture, UserTokens, VerificationCheck } from "./types";

const REQUEST_TIMEOUT = 20_000;

export class RemoteMcpVerificationError extends Error {
  readonly code: string;

  constructor(phase: string, message = `Real-provider remote MCP verification failed: ${phase}.`) {
    super(message);
    this.name = "RemoteMcpVerificationError";
    // Callers may report this static phase without exposing an upstream error.
    this.code = `remote_mcp_${phase.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 65)}`;
  }
}

const abortedError = () => new RemoteMcpVerificationError("aborted", "Real-provider remote MCP verification aborted.");

type JsonObject = Record<string, unknown>;
type ElicitationAnswer = {
  action: "accept" | "decline" | "cancel";
  content?: { approve: boolean };
};
type Connection = { client: Client; transport: StreamableHTTPClientTransport };
type Communication = {
  resourceType: string;
  id: string;
  status?: string;
  subject?: { reference?: string };
  payload?: Array<{ contentString?: string }>;
  meta?: { tag?: JsonObject[]; security?: JsonObject[] };
};

async function bounded<T>(promise: Promise<T>, milliseconds = REQUEST_TIMEOUT, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Verification operation timed out.")), milliseconds);
        onAbort = () => reject(abortedError());
        if (signal?.aborted) onAbort();
        else signal?.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

async function fetchWithDeadline(url: URL, init: RequestInit = {}, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    ...init,
    redirect: "error",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT)]) : AbortSignal.timeout(REQUEST_TIMEOUT),
  });
}

function toolPayload(result: Awaited<ReturnType<Client["callTool"]>>): JsonObject {
  assert(Array.isArray(result.content));
  const part = result.content.find((entry: unknown): entry is { type: "text"; text: string } =>
    Boolean(entry && typeof entry === "object" && "type" in entry && entry.type === "text" && "text" in entry && typeof entry.text === "string"));
  assert(part);
  return JSON.parse(part.text) as JsonObject;
}

/**
 * Exercise real IdP JWKS, Medplum token exchange and FHIR authorization through
 * the production HTTP server. Only the SDK caller and synthetic fixture admin
 * live in this harness; none of the server's security dependencies are replaced.
 * Errors deliberately name a static check, never an upstream body or credential.
 */
export async function verifyRemoteMcp({
  fixture,
  issuer,
  jwksUri,
  resource,
  port,
  writerTokens,
  readerTokens,
  issueExpiringTokens,
  signal,
}: {
  fixture: MedplumFixture;
  issuer: string;
  jwksUri: string;
  resource: string;
  port: number;
  writerTokens: UserTokens;
  readerTokens: UserTokens;
  issueExpiringTokens?: () => Promise<UserTokens>;
  signal?: AbortSignal;
}): Promise<VerificationCheck[]> {
  if (signal?.aborted) throw abortedError();
  const checks: VerificationCheck[] = [];
  const connections: Connection[] = [];
  const sessionIds: string[] = [];
  const logs: string[] = [];
  const secrets = [fixture.adminAccessToken, writerTokens.accessToken, writerTokens.idToken, readerTokens.accessToken, readerTokens.idToken];
  const runId = randomUUID();
  const note = `Synthetic remote MCP approval verification ${runId}`;
  const ownedNotes = new Set<string>([note]);
  let baseUrl: URL;
  try {
    baseUrl = new URL(fixture.baseUrl.endsWith("/") ? fixture.baseUrl : `${fixture.baseUrl}/`);
  } catch {
    throw new RemoteMcpVerificationError("fixture_url", "Real-provider remote MCP fixture URL is invalid.");
  }
  let server: StartedRemoteMcpServer | undefined;
  let releaseApproval: ((answer: ElicitationAnswer) => void) | undefined;
  let phase = "production HTTP server startup";
  let failure: Error | undefined;
  let serverClosing: Promise<void> | undefined;
  const closingConnections = new Map<Connection, Promise<void>>();
  const assertActive = () => {
    if (signal?.aborted) throw abortedError();
  };
  const request = (url: URL, init: RequestInit = {}) => fetchWithDeadline(url, init, signal);
  const closeConnection = (connection: Connection): Promise<void> => {
    let closing = closingConnections.get(connection);
    if (!closing) {
      closing = bounded(Promise.all([connection.client.close(), connection.transport.close()]).then(() => {}), 5_000);
      closingConnections.set(connection, closing);
    }
    return closing;
  };
  const closeServer = (): Promise<void> => {
    if (!server) return Promise.resolve();
    return serverClosing ??= server.close();
  };
  const onAbort = () => {
    releaseApproval?.({ action: "cancel" });
    for (const connection of connections) void closeConnection(connection).catch(() => {});
    void closeServer().catch(() => {});
  };

  const check = async (name: string, verify: () => Promise<void>) => {
    phase = name;
    assertActive();
    await verify();
    assertActive();
    checks.push({ name, status: "pass" });
  };
  const fhirUrl = (path: string) => new URL(`fhir/R4/${path}`, baseUrl);
  const adminHeaders = { authorization: `Bearer ${fixture.adminAccessToken}`, "content-type": "application/fhir+json" };
  const communications = async (): Promise<Communication[]> => {
    const url = fhirUrl("Communication");
    url.searchParams.set("subject", `Patient/${fixture.patientId}`);
    url.searchParams.set("_count", "100");
    const response = await request(url, { headers: adminHeaders });
    assert.equal(response.status, 200);
    const bundle = await response.json() as { entry?: Array<{ resource?: Communication }> };
    const resources = (bundle.entry ?? []).flatMap((entry) => entry.resource ? [entry.resource] : []);
    assert(resources.length < 100, "Synthetic fixture result must not be truncated.");
    assert(resources.every((entry) => entry.resourceType === "Communication" && entry.subject?.reference === `Patient/${fixture.patientId}`));
    return resources;
  };

  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    assertActive();
    // Do not spread process.env: bootstrap credentials must never become
    // credentials for the MCP runtime, which exchanges each caller's token.
    const config = loadMcpConfig({
      FHIR_BACKEND: "medplum",
      MEDPLUM_BASE_URL: fixture.baseUrl,
      LASTEHR_MCP_TRANSPORT: "http",
      LASTEHR_MCP_HTTP_HOST: "127.0.0.1",
      LASTEHR_MCP_HTTP_PORT: String(port || 3400),
      LASTEHR_MCP_RESOURCE: resource,
      LASTEHR_MCP_OAUTH_ISSUER: issuer,
      LASTEHR_MCP_OAUTH_JWKS_URI: jwksUri,
      LASTEHR_MCP_REQUIRED_SCOPES: "chart.read",
      LASTEHR_MCP_EXCHANGE_CLIENT_ID: fixture.exchangeClientId,
      LASTEHR_MCP_TOKEN_ENDPOINT: new URL("oauth2/token", baseUrl).href,
      LASTEHR_MCP_WRITES: "proposal",
    });
    assert(!config.accessToken && !config.clientId && !config.clientSecret);
    server = await startRemoteMcpServer({ config, port, log: (line) => logs.push(line) });
    if (signal?.aborted) {
      onAbort();
      assertActive();
    }
    const running = server;
    const url = new URL(`http://127.0.0.1:${running.address.port}${running.handler.paths.mcp}`);
    const raw = async ({
      method = "POST", token, sessionId, body,
    }: { method?: string; token?: string; sessionId?: string; body?: unknown }) => request(url, {
      method,
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": LATEST_PROTOCOL_VERSION,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const connect = async (token: string, elicitation: boolean, answer?: (message: string) => Promise<ElicitationAnswer>) => {
      const client = new Client(
        { name: "lastehr-real-provider-verification", version: "1.0.0" },
        { capabilities: elicitation ? { elicitation: { form: {} } } : {} },
      );
      if (elicitation) {
        client.setRequestHandler(ElicitRequestSchema, (message) => answer
          ? answer(message.params.message)
          : Promise.resolve({ action: "accept" as const, content: { approve: true } }));
      }
      const transport = new StreamableHTTPClientTransport(url, {
        requestInit: { headers: { authorization: `Bearer ${token}` }, signal },
      });
      const connection = { client, transport };
      connections.push(connection);
      assertActive();
      await client.connect(transport, { timeout: REQUEST_TIMEOUT, signal });
      assertActive();
      assert(transport.sessionId);
      sessionIds.push(transport.sessionId);
      return connection;
    };
    const call = (connection: Connection, name: string, args: JsonObject) => connection.client.callTool(
      { name, arguments: args }, undefined, { timeout: REQUEST_TIMEOUT, signal },
    );

    await check("protected resource discovery and bearer requirement", async () => {
      const metadata = await request(new URL(running.handler.paths.metadata, url));
      assert.equal(metadata.status, 200);
      const value = await metadata.json() as JsonObject;
      assert.equal(value.resource, resource);
      assert.deepEqual(value.authorization_servers, [issuer]);
      const unauthenticated = await raw({ body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
      assert.equal(unauthenticated.status, 401);
      assert(unauthenticated.headers.get("www-authenticate")?.includes("resource_metadata="));
      await unauthenticated.arrayBuffer();
      assert.equal((await communications()).length, 0);
    });

    const exchanged = new Map<string, string>();
    await check("real provider exchange resolves each expected Medplum identity", async () => {
      for (const [name, tokens, principal] of [
        ["writer", writerTokens, fixture.writer], ["reader", readerTokens, fixture.reader],
      ] as const) {
        assert.equal(decodeJwt(tokens.accessToken).sub, principal.subject);
        const response = await request(new URL("oauth2/token", baseUrl), {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
            subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
            client_id: fixture.exchangeClientId,
            subject_token: tokens.accessToken,
          }),
        });
        assert.equal(response.status, 200);
        const result = await response.json() as { access_token?: string; profile?: { reference?: string }; project?: { reference?: string } };
        assert.equal(result.profile?.reference, principal.profileReference);
        assert.equal(result.project?.reference, `Project/${fixture.projectId}`);
        assert(result.access_token);
        secrets.push(result.access_token);
        exchanged.set(name, result.access_token);
      }
      assert.notEqual(fixture.writer.profileReference, fixture.reader.profileReference);
    });

    await check("Medplum enforces distinct real-user read policies", async () => {
      for (const [name, expected] of [["writer", 200], ["reader", 403]] as const) {
        const response = await request(fhirUrl(`Observation/${fixture.observationId}`), {
          headers: { authorization: `Bearer ${exchanged.get(name)}` },
        });
        assert.equal(response.status, expected);
        await response.arrayBuffer();
      }
    });

    let writerAnswer: (message: string) => Promise<ElicitationAnswer> = async () => ({ action: "accept", content: { approve: true } });
    let readerApprovals = 0;
    phase = "real HTTP client initialization";
    const writer = await connect(writerTokens.accessToken, true, (message) => writerAnswer(message));
    const reader = await connect(readerTokens.accessToken, true, async () => {
      readerApprovals += 1;
      return { action: "accept", content: { approve: true } };
    });
    const incapable = await connect(writerTokens.accessToken, false);
    await check("real HTTP tools preserve per-caller reads and approval capability", async () => {
      const capableTools = (await writer.client.listTools(undefined, { timeout: REQUEST_TIMEOUT, signal })).tools.map((tool) => tool.name).sort();
      assert.deepEqual(capableTools, [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES].sort());
      const readerTools = (await reader.client.listTools(undefined, { timeout: REQUEST_TIMEOUT, signal })).tools.map((tool) => tool.name).sort();
      assert.deepEqual(readerTools, capableTools);
      const bareTools = (await incapable.client.listTools(undefined, { timeout: REQUEST_TIMEOUT, signal })).tools.map((tool) => tool.name).sort();
      assert.deepEqual(bareTools, [...READ_TOOL_NAMES].sort());
      const args = { patientId: fixture.patientId, resourceType: "Observation" };
      const allowed = await call(writer, "read_chart_section", args);
      assert(!allowed.isError);
      const entries = toolPayload(allowed).entries as Array<{ id: string }>;
      assert(entries.some((entry) => entry.id === fixture.observationId));
      assert((await call(reader, "read_chart_section", args)).isError);
    });

    let markElicited: () => void = () => {};
    const elicited = new Promise<void>((resolve) => { markElicited = resolve; });
    const answer = new Promise<ElicitationAnswer>((resolve) => { releaseApproval = resolve; });
    let elicitationId: string | number | undefined;
    const onMessage = writer.transport.onmessage;
    writer.transport.onmessage = (message: JSONRPCMessage) => {
      if ("method" in message && message.method === "elicitation/create" && "id" in message) elicitationId = message.id;
      onMessage?.(message);
    };
    writerAnswer = async (message) => {
      assert(message.includes(`Patient/${fixture.patientId}`));
      assert(message.includes(JSON.stringify(note)));
      markElicited();
      return answer;
    };
    const pending = call(writer, "add_note", { patientId: fixture.patientId, text: note });
    // The awaiting check owns the failure; suppress premature unhandled
    // rejection if the transport fails before the elicitation arrives.
    void pending.catch(() => {});
    await check("approval remains pending without a persisted write", async () => {
      await bounded(elicited, REQUEST_TIMEOUT, signal);
      assert.equal((await communications()).length, 0);
      assert(elicitationId !== undefined);
    });

    await check("another real caller cannot use or approve the writer session", async () => {
      const list = { jsonrpc: "2.0", id: 91, method: "tools/list" };
      const unknown = await raw({ token: readerTokens.accessToken, sessionId: randomUUID(), body: list });
      assert.equal(unknown.status, 404);
      const unknownBody = await unknown.text();
      for (const method of ["POST", "GET", "DELETE"]) {
        const response = await raw({ method, token: readerTokens.accessToken, sessionId: writer.transport.sessionId, ...(method === "POST" ? { body: list } : {}) });
        assert.equal(response.status, 404);
        assert.equal(await response.text(), unknownBody);
      }
      const forged = await raw({
        token: readerTokens.accessToken,
        sessionId: writer.transport.sessionId,
        body: { jsonrpc: "2.0", id: elicitationId, result: { action: "accept", content: { approve: true } } },
      });
      assert.equal(forged.status, 404);
      assert.equal(await forged.text(), unknownBody);
      assert.equal((await communications()).length, 0);
    });

    await check("approved note persists exact fields and AI labels in real Medplum", async () => {
      releaseApproval?.({ action: "accept", content: { approve: true } });
      releaseApproval = undefined;
      const result = await pending;
      assert(!result.isError);
      const saved = toolPayload(result);
      assert.equal(saved.saved, true);
      assert.equal(saved.resourceType, "Communication");
      const stored = await communications();
      assert.equal(stored.length, 1);
      assert.equal(stored[0].id, saved.id);
      assert.equal(stored[0].status, "completed");
      assert.equal(stored[0].subject?.reference, `Patient/${fixture.patientId}`);
      assert.deepEqual(stored[0].payload, [{ contentString: note }]);
      assert(stored[0].meta?.tag?.some((tag) => tag.system === MCP_WRITE_TAG.system && tag.code === MCP_WRITE_TAG.code));
      assert(stored[0].meta?.security?.some((tag) => tag.system === AIAST_LABEL.system && tag.code === AIAST_LABEL.code));
    });

    await check("decline cancel and unchecked approval persist no additional notes", async () => {
      for (const decision of [
        { action: "decline" }, { action: "cancel" }, { action: "accept", content: { approve: false } },
      ] as ElicitationAnswer[]) {
        const text = `Synthetic declined remote MCP verification ${randomUUID()}`;
        ownedNotes.add(text);
        writerAnswer = async () => decision;
        const result = await call(writer, "add_note", { patientId: fixture.patientId, text });
        assert(!result.isError);
        assert.equal(toolPayload(result).saved, false);
        assert.equal((await communications()).length, 1);
      }
    });

    await check("client without elicitation cannot force a write", async () => {
      const text = `Synthetic incapable client verification ${randomUUID()}`;
      ownedNotes.add(text);
      assert((await call(incapable, "add_note", { patientId: fixture.patientId, text })).isError);
      assert.equal((await communications()).length, 1);
    });

    await check("backend returns forbidden and refuses an approved restricted-user write", async () => {
      const text = `Synthetic restricted user verification ${randomUUID()}`;
      ownedNotes.add(text);
      const control = await request(fhirUrl("Communication"), {
        method: "POST",
        headers: { authorization: `Bearer ${exchanged.get("reader")}`, "content-type": "application/fhir+json" },
        body: JSON.stringify({ resourceType: "Communication", status: "completed", subject: { reference: `Patient/${fixture.patientId}` }, payload: [{ contentString: text }] }),
      });
      assert.equal(control.status, 403);
      await control.arrayBuffer();
      assert((await call(reader, "add_note", { patientId: fixture.patientId, text })).isError);
      assert.equal(readerApprovals, 1);
      assert.equal((await communications()).length, 1);
    });

    await check("real provider ID token with another audience is refused", async () => {
      const audience = decodeJwt(writerTokens.idToken).aud;
      assert(typeof audience === "string" ? audience !== resource : Array.isArray(audience) && !audience.includes(resource));
      const response = await raw({ token: writerTokens.idToken, sessionId: writer.transport.sessionId, body: { jsonrpc: "2.0", id: 92, method: "tools/list" } });
      assert.equal(response.status, 401);
      await response.arrayBuffer();
    });

    if (issueExpiringTokens) {
      await check("actual short-lived provider token is rejected after expiry", async () => {
        const tokens = await bounded(issueExpiringTokens(), REQUEST_TIMEOUT, signal);
        secrets.push(tokens.accessToken, tokens.idToken);
        const payload = decodeJwt(tokens.accessToken);
        assert.equal(payload.sub, fixture.writer.subject);
        assert(typeof payload.exp === "number");
        const waitMs = payload.exp * 1000 - Date.now() + 1_100;
        assert(waitMs > 0 && waitMs <= 30_000);
        // A different OAuth client has a different source identity even for the
        // same user, so this token must establish its own bound MCP session.
        const expiring = await connect(tokens.accessToken, false);
        const valid = await raw({ token: tokens.accessToken, sessionId: expiring.transport.sessionId, body: { jsonrpc: "2.0", id: 93, method: "tools/list" } });
        assert.equal(valid.status, 200);
        await valid.arrayBuffer();
        await delay(Math.max(0, payload.exp! * 1000 - Date.now() + 1_100), undefined, { signal });
        const expired = await raw({ token: tokens.accessToken, sessionId: expiring.transport.sessionId, body: { jsonrpc: "2.0", id: 94, method: "tools/list" } });
        assert.equal(expired.status, 401);
        await expired.arrayBuffer();
      });
    }
  } catch {
    failure = signal?.aborted ? abortedError() : new RemoteMcpVerificationError(phase);
  } finally {
    releaseApproval?.({ action: "cancel" });
    for (const connection of connections.reverse()) {
      try {
        await closeConnection(connection);
      } catch {
        failure ??= new RemoteMcpVerificationError("client_cleanup", "Real-provider remote MCP client cleanup failed.");
      }
    }
    try {
      await closeServer();
    } catch {
      failure ??= new RemoteMcpVerificationError("server_cleanup", "Real-provider remote MCP server cleanup failed.");
    }
    signal?.removeEventListener("abort", onAbort);
    try {
      // Scope every query to the owned synthetic patient, and delete only
      // this invocation's exact note payloads, including unexpected saves.
      const stored = signal?.aborted ? [] : await communications();
      for (const entry of stored.filter((entry) => entry.payload?.some((payload) => payload.contentString && ownedNotes.has(payload.contentString)))) {
        const response = await request(fhirUrl(`Communication/${entry.id}`), { method: "DELETE", headers: adminHeaders });
        assert([200, 204, 404, 410].includes(response.status));
        await response.arrayBuffer();
      }
    } catch {
      failure ??= new RemoteMcpVerificationError("synthetic_note_cleanup", "Real-provider remote MCP synthetic note cleanup failed.");
    }
  }
  assertActive();
  if (failure) throw failure;
  const combinedLogs = logs.join("\n");
  if ([...secrets, ...sessionIds].some((secret) => secret && combinedLogs.includes(secret))) {
    throw new RemoteMcpVerificationError("credential_redaction", "Real-provider remote MCP credential redaction verification failed.");
  }
  checks.push({ name: "remote server logs contain no credentials or raw session identifiers", status: "pass" });
  return checks;
}
