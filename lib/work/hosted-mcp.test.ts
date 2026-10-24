import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { createServer, request as httpRequest, type IncomingMessage, type Server as HttpServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkAssistantContext } from "./context";
import { createHostedWorkMcpHandler, type HostedWorkMcpLimits } from "./hosted-mcp";
import { DurableWorkService, type WorkActor, type WorkJob, type WorkTaskRecord } from "./service";

const context: WorkAssistantContext = {
  patient: { reference: "Patient/synthetic-patient", label: "Alex Synthetic Worklab", dateOfBirth: "2000-01-01" },
  observation: { reference: "Observation/synthetic-result", versionId: "1", label: "Demonstration HbA1c", value: 6.4, unit: "%", effectiveDateTime: "2026-01-01T12:00:00Z" },
};
const reviewer: WorkActor = { tenantId: "synthetic-work-lab", subject: "reviewer-test", role: "reviewer" };
const actors: Record<string, WorkActor> = {
  "token-a": { tenantId: reviewer.tenantId, subject: "assistant-a", role: "assistant" },
  "token-a-fresh": { tenantId: reviewer.tenantId, subject: "assistant-a", role: "assistant" },
  "token-b": { tenantId: reviewer.tenantId, subject: "assistant-b", role: "assistant" },
};
const initialize = (id: number) => ({ jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "hosted-work-test", version: "1" } } });
const cleanups: Array<() => Promise<void>> = [];

async function rig(limits: Partial<HostedWorkMcpLimits> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "last-hosted-work-mcp-"));
  await chmod(directory, 0o700);
  let clock = Date.now();
  const initialExpiry = clock + 60_000;
  const records: WorkTaskRecord[] = [];
  const committer = {
    validateContext: vi.fn(async () => true),
    findByJobId: vi.fn(async ({ jobId }: { jobId: string }) => records.filter((record) => (record.resource as WorkJob["proposal"]).identifier.some((identifier) => identifier.value === jobId))),
    conditionalCreate: vi.fn(async ({ proposal }: { proposal: WorkJob["proposal"] }) => {
      const id = `synthetic-task-${records.length + 1}`;
      const record: WorkTaskRecord = { id, versionId: "1", resource: { ...structuredClone(proposal), id, meta: { versionId: "1" } } };
      records.push(record); return record;
    }),
  };
  const service = new DurableWorkService({ storePath: join(directory, "work.sqlite"), reviewer, committer, now: () => clock });
  const readContext = vi.fn(async () => structuredClone(context));
  const verifyAssistant = vi.fn(async (authorization?: string) => {
    const token = authorization?.replace(/^Bearer /, "") ?? "";
    const actor = actors[token];
    if (!actor) throw new Error("private-verifier-diagnostic");
    return { actor: { ...actor }, principal: `issuer/client/${actor.subject}`, expiresAt: token === "token-a-fresh" ? initialExpiry + 600_000 : initialExpiry };
  });
  const stripped: Array<{ authorization: string | undefined; raw: string[]; cookie: string | undefined }> = [];
  const requests: IncomingMessage[] = [];
  const server: HttpServer = createServer((req, res) => {
    requests.push(req);
    void handler.listener(req, res).then(() => { stripped.push({ authorization: req.headers.authorization, raw: req.rawHeaders, cookie: req.headers.cookie }); });
  });
  await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test listener.");
  const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const handler = createHostedWorkMcpHandler({ publicUrl: url.href, issuer: "https://issuer.example.test/", service, readContext, verifyAssistant, now: () => clock, limits });
  const clients: Array<{ client: Client; transport: StreamableHTTPClientTransport }> = [];
  const instance = { directory, handler, service, server, url, verifyAssistant, readContext, records, committer, stripped, requests, clients, initialExpiry, advance: (milliseconds: number) => { clock += milliseconds; }, now: () => clock };
  cleanups.push(async () => {
    await Promise.all(clients.map(async ({ client }) => { await client.close(); }));
    await handler.close();
    server.closeAllConnections();
    await new Promise<void>((accept) => server.close(() => accept()));
    service.close();
    await rm(directory, { recursive: true, force: true });
  });
  return instance;
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function connect(instance: Awaited<ReturnType<typeof rig>>, token = "token-a") {
  const client = new Client({ name: "actual-sdk-hosted-work", version: "1" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(instance.url, { requestInit: { headers: { authorization: `Bearer ${token}` } } });
  instance.clients.push({ client, transport });
  await client.connect(transport);
  return { client, transport };
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const response = await client.callTool({ name, arguments: args }) as CallToolResult;
  expect(response.content[0].type).toBe("text");
  expect(JSON.parse((response.content[0] as { text: string }).text)).toEqual(response.structuredContent);
  return response;
}

function raw(instance: Awaited<ReturnType<typeof rig>>, options: { token?: string; method?: string; sessionId?: string; body?: unknown; headers?: Record<string, string>; query?: string } = {}) {
  return fetch(`${instance.url}${options.query ?? ""}`, {
    method: options.method ?? "POST", redirect: "error", signal: AbortSignal.timeout(3_000),
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json", ...(options.token ? { authorization: `Bearer ${options.token}` } : {}), ...(options.sessionId ? { "mcp-session-id": options.sessionId } : {}), ...options.headers },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

const proposal = () => ({ description: "Review the invented HbA1c result and arrange synthetic follow-up.", sourceReference: context.observation.reference, sourceVersionId: context.observation.versionId, idempotencyKey: randomUUID() });

describe("hosted assistant-only Work MCP transport", () => {
  it("publishes scoped discovery and a standard static 401 challenge without leaking verification diagnostics", async () => {
    const instance = await rig();
    const discovery = await fetch(new URL(instance.handler.paths.metadata, instance.url));
    expect(discovery.status).toBe(200);
    expect(await discovery.json()).toEqual({ resource: instance.url.href, authorization_servers: ["https://issuer.example.test/"], scopes_supported: ["work:assistant"], bearer_methods_supported: ["header"], resource_documentation: "https://www.lastehr.com/docs/hosted-work" });
    for (const method of ["POST", "GET", "DELETE"]) {
      const response = await raw(instance, { method, token: "invalid-secret-token", ...(method === "POST" ? { body: initialize(1) } : {}) });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain(`resource_metadata="${new URL(instance.handler.paths.metadata, instance.url).href}"`);
      const text = await response.text();
      expect(text).not.toContain("private-verifier");
      expect(text).not.toContain("invalid-secret-token");
    }
    expect(instance.verifyAssistant).toHaveBeenCalledTimes(3);
    expect(instance.handler.sessionCount()).toBe(0);
  });

  it("serves exactly four real SDK tools with bounded reads, separate review, a verified result, and stripped credentials", async () => {
    const instance = await rig();
    const { client, transport } = await connect(instance);
    expect(client.getServerCapabilities()).toEqual({ tools: {} });
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["read_work_context", "propose_work", "get_work", "cancel_work"]);
    expect((await call(client, "approve_work", {})).isError).toBe(true);
    const input = proposal();
    const blocked = await call(client, "propose_work", input);
    expect(blocked.isError).toBe(true);
    expect(blocked.structuredContent?.error).toBe("context_required");
    const chart = await call(client, "read_work_context", {});
    expect(chart.structuredContent?.context).toEqual(context);
    const submitted = await call(client, "propose_work", input);
    const job = submitted.structuredContent?.job as WorkJob;
    expect(job.state).toBe("awaiting_review");
    expect(job.input.patientId).toBe("synthetic-patient");
    expect(instance.readContext).toHaveBeenCalledTimes(2);
    expect((await call(client, "propose_work", input)).structuredContent?.job).toEqual(job);
    expect(instance.records).toHaveLength(0);
    const completed = await instance.service.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash });
    expect(completed.state).toBe("succeeded");
    const result = await call(client, "get_work", { workId: job.id });
    expect(result.structuredContent?.job).toEqual(completed);
    expect(result.structuredContent?.message).toContain("independently verified Task/synthetic-task-1");
    expect(instance.records).toHaveLength(1);
    expect(instance.records[0].resource).toEqual({ ...job.proposal, id: "synthetic-task-1", meta: { versionId: "1" } });
    const notified = await raw(instance, { token: "token-a", sessionId: transport.sessionId, body: { jsonrpc: "2.0", method: "notifications/initialized" }, headers: { cookie: "reviewer=private-cookie" } });
    expect(notified.status).toBe(202);
    expect(instance.stripped.every((value) => value.authorization === undefined && value.cookie === undefined && !value.raw.some((header) => /Bearer |private-cookie/.test(header)))).toBe(true);
    const count = instance.verifyAssistant.mock.calls.length;
    await client.listTools();
    expect(instance.verifyAssistant.mock.calls.length).toBeGreaterThan(count);
  });

  it("binds both HTTP session and durable jobs to the verified principal", async () => {
    const instance = await rig();
    const a = await connect(instance, "token-a");
    const b = await connect(instance, "token-b");
    await call(a.client, "read_work_context", {});
    const job = (await call(a.client, "propose_work", proposal())).structuredContent?.job as WorkJob;
    const list = { jsonrpc: "2.0", id: 44, method: "tools/list", params: {} };
    const foreign = await raw(instance, { token: "token-b", sessionId: a.transport.sessionId, body: list });
    const unknown = await raw(instance, { token: "token-b", sessionId: randomUUID(), body: list });
    expect(foreign.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await foreign.text()).toBe(await unknown.text());
    const getForeign = await call(b.client, "get_work", { workId: job.id });
    const getUnknown = await call(b.client, "get_work", { workId: randomUUID() });
    expect(getForeign.structuredContent).toEqual(getUnknown.structuredContent);
    expect(getForeign.structuredContent?.error).toBe("not_found");
    const foreignDelete = await raw(instance, { token: "token-b", method: "DELETE", sessionId: a.transport.sessionId });
    expect(foreignDelete.status).toBe(404);
    expect((await call(a.client, "get_work", { workId: job.id })).structuredContent?.job).toEqual(job);
    expect(instance.handler.sessionCount()).toBe(2);
  });

  it("supports assistant cancellation and reviewer denial with no persisted Task", async () => {
    const instance = await rig();
    const { client } = await connect(instance);
    await call(client, "read_work_context", {});
    const first = (await call(client, "propose_work", proposal())).structuredContent?.job as WorkJob;
    expect((await call(client, "cancel_work", { workId: first.id })).structuredContent?.job).toMatchObject({ state: "cancelled" });
    const second = (await call(client, "propose_work", proposal())).structuredContent?.job as WorkJob;
    await instance.service.decide(reviewer, second.id, { decision: "deny", proposalHash: second.proposalHash });
    expect((await call(client, "get_work", { workId: second.id })).structuredContent?.job).toMatchObject({ state: "denied" });
    expect(instance.records).toHaveLength(0);
    expect(instance.committer.conditionalCreate).not.toHaveBeenCalled();
  });

  it("checks a fresh chart version before submit and clears failed/changed cached reads", async () => {
    const instance = await rig();
    const { client } = await connect(instance);
    await call(client, "read_work_context", {});
    instance.readContext.mockResolvedValueOnce({ ...context, observation: { ...context.observation, versionId: "2" } });
    expect((await call(client, "propose_work", proposal())).structuredContent?.error).toBe("source_mismatch");
    expect((await call(client, "propose_work", proposal())).structuredContent?.error).toBe("context_required");
    await call(client, "read_work_context", {});
    instance.readContext.mockRejectedValueOnce(new Error("private-chart-backend-diagnostic"));
    const failure = await call(client, "read_work_context", {});
    expect(failure.isError).toBe(true);
    expect(JSON.stringify(failure)).not.toContain("private-chart-backend");
    expect((await call(client, "propose_work", proposal())).structuredContent?.error).toBe("context_required");
    expect(await instance.service.list(reviewer)).toHaveLength(0);
  });

  it("does not extend a session beyond its initial token expiry and rejects expired authorization on every method", async () => {
    const instance = await rig();
    const { transport } = await connect(instance, "token-a");
    instance.advance(60_001);
    const expired = await raw(instance, { token: "token-a", sessionId: transport.sessionId, body: { jsonrpc: "2.0", id: 9, method: "tools/list", params: {} } });
    expect(expired.status).toBe(401);
    const freshToken = await raw(instance, { token: "token-a-fresh", sessionId: transport.sessionId, body: { jsonrpc: "2.0", id: 10, method: "tools/list", params: {} } });
    expect(freshToken.status).toBe(404);
    expect(instance.handler.sessionCount()).toBe(0);
    for (const method of ["GET", "DELETE"]) expect((await raw(instance, { token: "token-a", method, sessionId: transport.sessionId })).status).toBe(401);
  });

  it("cleans idle sessions, explicit DELETEs, and shutdown while leaving durable pending work available to a new session", async () => {
    const instance = await rig({ idleTimeoutMs: 1000 });
    const first = await connect(instance);
    await call(first.client, "read_work_context", {});
    const job = (await call(first.client, "propose_work", proposal())).structuredContent?.job as WorkJob;
    instance.advance(1001);
    const expired = await raw(instance, { token: "token-a", sessionId: first.transport.sessionId, body: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} } });
    expect(expired.status).toBe(404);
    expect(instance.handler.sessionCount()).toBe(0);
    const second = await connect(instance);
    expect((await call(second.client, "get_work", { workId: job.id })).structuredContent?.job).toEqual(job);
    const deleted = await raw(instance, { token: "token-a", sessionId: second.transport.sessionId, method: "DELETE" });
    expect(deleted.status).toBe(200);
    expect(instance.handler.sessionCount()).toBe(0);
    await connect(instance, "token-b");
    await instance.handler.close();
    expect(instance.handler.sessionCount()).toBe(0);
    expect((await raw(instance, { token: "token-a", body: initialize(4) })).status).toBe(503);
  });

  it("enforces hard total/per-principal capacity including concurrent initialization and releases failed initialization", async () => {
    const instance = await rig({ maxSessions: 2, maxSessionsPerPrincipal: 1 });
    const failures = await raw(instance, { token: "token-a", body: initialize(1), headers: { accept: "application/json" } });
    expect(failures.status).toBe(406);
    expect(instance.handler.sessionCount()).toBe(0);
    const responses = await Promise.all([1, 2].map((id) => raw(instance, { token: "token-a", body: initialize(id) })));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 503]);
    expect(instance.handler.sessionCount()).toBe(1);
    const b = await raw(instance, { token: "token-b", body: initialize(3) });
    expect(b.status).toBe(200);
    expect(instance.handler.sessionCount()).toBe(2);
    expect((await raw(instance, { token: "token-a-fresh", body: initialize(4) })).status).toBe(503);
    const a = responses.find((response) => response.status === 200)!;
    expect((await raw(instance, { token: "token-a", sessionId: a.headers.get("mcp-session-id")!, method: "DELETE" })).status).toBe(200);
    expect(instance.handler.sessionCount()).toBe(1);
    expect((await raw(instance, { token: "token-a", body: initialize(5) })).status).toBe(200);
  });

  it("rejects query credentials, foreign origins, oversized/malformed bodies, and batch initialization before creating sessions", async () => {
    const instance = await rig();
    expect((await raw(instance, { token: "token-a", query: "?access_token=private-query-value", body: initialize(1) })).status).toBe(400);
    expect((await raw(instance, { token: "token-a", headers: { origin: "https://foreign.example" }, body: initialize(1) })).status).toBe(403);
    expect((await raw(instance, { token: "token-a", body: { ...initialize(1), payload: "x".repeat(16 * 1024) } })).status).toBe(413);
    expect((await raw(instance, { token: "token-a", body: [initialize(1)] })).status).toBe(400);
    expect((await raw(instance, { token: "token-a", body: { jsonrpc: "2.0", method: "initialize", params: initialize(1).params } })).status).toBe(400);
    const malformed = await fetch(instance.url, { method: "POST", headers: { authorization: "Bearer token-a", "content-type": "application/json" }, body: "{not-json-private-input", signal: AbortSignal.timeout(3_000) });
    expect(malformed.status).toBe(400);
    expect(await malformed.text()).not.toContain("private-input");
    expect(instance.handler.sessionCount()).toBe(0);
  });

  it("never allocates a session when shutdown finishes during token verification", async () => {
    const instance = await rig();
    let resolveIdentity!: (value: { actor: WorkActor; principal: string; expiresAt: number }) => void;
    let verificationStarted!: () => void;
    const started = new Promise<void>((accept) => { verificationStarted = accept; });
    instance.verifyAssistant.mockImplementationOnce(async () => {
      verificationStarted();
      return new Promise((accept) => { resolveIdentity = accept; });
    });
    const pending = raw(instance, { token: "token-a", body: initialize(77) });
    await started;
    await instance.handler.close();
    expect(instance.handler.sessionCount()).toBe(0);
    resolveIdentity({ actor: { ...actors["token-a"] }, principal: "issuer/client/assistant-a", expiresAt: instance.initialExpiry });
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("shutting down");
    expect(instance.handler.sessionCount()).toBe(0);
    expect(instance.readContext).not.toHaveBeenCalled();
  });

  it("never allocates a session when shutdown finishes during a partial JSON upload", async () => {
    const instance = await rig();
    const body = JSON.stringify(initialize(78));
    const writer = httpRequest(instance.url, { method: "POST", headers: { authorization: "Bearer token-a", "content-type": "application/json", accept: "application/json, text/event-stream" } });
    const response = new Promise<{ status: number; body: string }>((accept, reject) => {
      writer.once("error", reject);
      writer.once("response", (incoming) => {
        const parts: Buffer[] = [];
        incoming.on("data", (part) => parts.push(Buffer.from(part)));
        incoming.once("end", () => accept({ status: incoming.statusCode!, body: Buffer.concat(parts).toString("utf8") }));
      });
    });
    writer.setTimeout(3_000, () => writer.destroy(new Error("Test request timed out.")));
    try {
      writer.write(body.slice(0, 10));
      await vi.waitFor(() => expect(instance.requests.at(-1)?.listenerCount("data")).toBeGreaterThan(0));
      await instance.handler.close();
      expect(instance.handler.sessionCount()).toBe(0);
      writer.end(body.slice(10));
      const result = await response;
      expect(result.status).toBe(503);
      expect(result.body).toContain("shutting down");
      expect(instance.handler.sessionCount()).toBe(0);
    } finally { writer.destroy(); }
  });
});
