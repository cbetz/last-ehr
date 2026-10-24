import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import { request as httpRequest } from "node:http";

import type { WorkAssistantContext } from "../lib/work/context";
import type { WorkJob } from "../lib/work/service";
import { createHostedWorkFixture } from "../test/hosted-work-fixture";

type Fixture = Awaited<ReturnType<typeof createHostedWorkFixture>>;
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function rig() {
  const fixture = await createHostedWorkFixture();
  cleanups.push(fixture.close);
  return fixture;
}

async function connect(fixture: Fixture, identity: "a" | "b" = "a") {
  const client = new Client({ name: "hosted-http-integration-test", version: "1" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(fixture.mcpUrl), { requestInit: { headers: { authorization: `Bearer ${await fixture.token(identity)}` } } });
  await client.connect(transport);
  cleanups.push(() => client.close());
  return { client, transport };
}

async function call<T>(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  return { result, value: result.structuredContent as T };
}

async function propose(client: Client, idempotencyKey: string) {
  const { value } = await call<{ context: WorkAssistantContext }>(client, "read_work_context");
  return call<{ job: WorkJob; workId: string }>(client, "propose_work", {
    description: "Review the invented HbA1c result with the synthetic care team. No patient contact.", dueDate: "2026-11-01",
    sourceReference: value.context.observation.reference, sourceVersionId: value.context.observation.versionId, idempotencyKey,
  });
}

async function signIn(fixture: Fixture) {
  const begin = await fetch(`${fixture.origin}/auth/login`, { redirect: "manual" });
  expect(begin.status).toBe(303);
  const loginHeader = begin.headers.getSetCookie()[0];
  expect(loginHeader).toContain("HttpOnly");
  expect(loginHeader).toContain("SameSite=Lax");
  const authorize = await fetch(begin.headers.get("location")!, { redirect: "manual" });
  expect(authorize.status).toBe(303);
  const callback = await fetch(authorize.headers.get("location")!, { headers: { cookie: loginHeader.split(";")[0] }, redirect: "manual" });
  const session = callback.headers.getSetCookie().find((header) => header.startsWith("last_work_reviewer_test="))?.split(";")[0];
  return { callback, session, callbackUrl: authorize.headers.get("location")!, loginCookie: loginHeader.split(";")[0] };
}

const decisionHeaders = (fixture: Fixture, cookie: string) => ({ cookie, origin: fixture.origin, "x-last-work-request": "reviewer", "content-type": "application/json" });

function rawStatus(url: string, headers: Record<string, string>) {
  return new Promise<number>((accept, reject) => {
    const request = httpRequest(url, { headers, agent: false }, (response) => { response.resume(); response.once("end", () => accept(response.statusCode!)); });
    request.once("error", reject); request.end();
  });
}

describe("hosted Work HTTP with actual signed JWTs and HTTP JWKS/OIDC", () => {
  it("reads and proposes through MCP, separately signs in the reviewer, and returns only the exact verified save", async () => {
    const fixture = await rig();
    const { client } = await connect(fixture);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(["read_work_context", "propose_work", "get_work", "cancel_work"]);
    const submitted = await propose(client, "hosted-http-approved-001");
    expect(submitted.result.isError).not.toBe(true);
    const job = submitted.value.job;
    expect(job.state).toBe("awaiting_review");
    expect(fixture.taskRecords.size).toBe(0);
    const login = await signIn(fixture);
    expect(login.callback.status).toBe(303);
    expect(login.session).toBeDefined();
    const cookie = login.session!;
    const inbox = await fetch(`${fixture.origin}/api/reviewer/work`, { headers: { cookie } });
    expect(inbox.status).toBe(200);
    expect(await inbox.json()).toMatchObject({ jobs: [{ id: job.id, proposalHash: job.proposalHash, requestedBy: job.requestedBy }] });
    const approved = await fetch(`${fixture.origin}/api/reviewer/work/${job.id}/decision`, { method: "POST", headers: decisionHeaders(fixture, cookie), body: JSON.stringify({ decision: "approve", proposalHash: job.proposalHash }) });
    expect(approved.status).toBe(200);
    const saved = (await approved.json()) as { job: WorkJob };
    expect(saved.job.state).toBe("succeeded");
    expect(saved.job.decision?.subject).toBe(fixture.auth.reviewerActor.subject);
    expect(saved.job.requestedBy).not.toBe(saved.job.decision?.subject);
    expect(saved.job.receipt).toMatchObject({ resourceType: "Task", id: "hosted-synthetic-task-1", versionId: "1" });
    expect(fixture.taskRecords.size).toBe(1);
    expect(fixture.taskRecords.get(job.id)?.resource).toEqual({ ...job.proposal, id: "hosted-synthetic-task-1", meta: { versionId: "1" } });
    const status = await call<{ job: WorkJob }>(client, "get_work", { workId: job.id });
    expect(status.value.job).toEqual(saved.job);
    const retry = await fetch(`${fixture.origin}/api/reviewer/work/${job.id}/decision`, { method: "POST", headers: decisionHeaders(fixture, cookie), body: JSON.stringify({ decision: "approve", proposalHash: job.proposalHash }) });
    expect(retry.status).toBe(200);
    expect(fixture.taskRecords.size).toBe(1);
    const replay = await fetch(login.callbackUrl, { headers: { cookie: login.loginCookie }, redirect: "manual" });
    expect(replay.status).toBe(401);
  });

  it("rejects assistant review, foreign work/session access, stale hashes, CSRF, Host and Origin attacks", async () => {
    const fixture = await rig();
    const a = await connect(fixture);
    const b = await connect(fixture, "b");
    const { value: { job } } = await propose(a.client, "hosted-http-boundary-001");
    expect((await call(b.client, "get_work", { workId: job.id })).result.isError).toBe(true);
    expect((await call(b.client, "cancel_work", { workId: job.id })).result.isError).toBe(true);
    expect((await call(a.client, "approve_work", { workId: job.id })).result.isError).toBe(true);
    const bearer = await fixture.token();
    expect((await fetch(`${fixture.origin}/api/reviewer/work`, { headers: { authorization: `Bearer ${bearer}` } })).status).toBe(401);
    const foreignSession = await fetch(fixture.mcpUrl, { method: "DELETE", headers: { authorization: `Bearer ${await fixture.token("b")}`, "mcp-session-id": a.transport.sessionId! } });
    expect(foreignSession.status).toBe(404);
    expect(await rawStatus(`${fixture.origin}/health`, { host: "attacker.example.test" })).toBe(400);
    expect((await fetch(`${fixture.origin}/health`, { headers: { origin: "https://attacker.example.test" } })).status).toBe(403);
    const login = await signIn(fixture);
    const endpoint = `${fixture.origin}/api/reviewer/work/${job.id}/decision`;
    const body = JSON.stringify({ decision: "approve", proposalHash: job.proposalHash });
    expect((await fetch(endpoint, { method: "POST", headers: { cookie: login.session!, "content-type": "application/json", "x-last-work-request": "reviewer" }, body })).status).toBe(403);
    expect((await fetch(endpoint, { method: "POST", headers: { cookie: login.session!, origin: fixture.origin, "content-type": "application/json" }, body })).status).toBe(403);
    expect((await fetch(endpoint, { method: "POST", headers: decisionHeaders(fixture, login.session!), body: JSON.stringify({ decision: "approve", proposalHash: "0".repeat(64) }) })).status).toBe(409);
    expect(fixture.taskRecords.size).toBe(0);
    expect((await call<{ job: WorkJob }>(a.client, "get_work", { workId: job.id })).value.job.state).toBe("awaiting_review");
  });

  it("rejects an unauthorized IdP subject and invalidates logged-out reviewer sessions", async () => {
    const fixture = await rig();
    fixture.setReviewerSubject("unauthorized-person");
    const denied = await signIn(fixture);
    expect(denied.callback.status).toBe(401);
    expect(denied.session).toBeUndefined();
    const denial = await denied.callback.json();
    expect(JSON.stringify(denial)).not.toContain("unauthorized-person");
    fixture.setReviewerSubject("reviewer-person");
    const login = await signIn(fixture);
    expect(login.callback.status).toBe(303);
    expect((await fetch(`${fixture.origin}/api/reviewer/session`, { headers: { cookie: login.session! } })).status).toBe(200);
    const logout = await fetch(`${fixture.origin}/api/reviewer/session`, { method: "DELETE", headers: decisionHeaders(fixture, login.session!) });
    expect(logout.status).toBe(200);
    expect(logout.headers.getSetCookie()[0]).toContain("Max-Age=0");
    expect((await fetch(`${fixture.origin}/api/reviewer/session`, { headers: { cookie: login.session! } })).status).toBe(401);
  });

  it("retains durable pending work and receipt across restarts while requiring a fresh reviewer session", async () => {
    const fixture = await rig();
    const first = await connect(fixture);
    const { value: { job } } = await propose(first.client, "hosted-http-restart-001");
    const previous = await signIn(fixture);
    await first.client.close();
    await fixture.restart();
    expect(await rawStatus(`${fixture.origin}/api/reviewer/work`, { cookie: previous.session! })).toBe(401);
    const next = await connect(fixture);
    const pending = await call<{ job: WorkJob }>(next.client, "get_work", { workId: job.id });
    expect(pending.value.job).toEqual(job);
    expect(fixture.taskRecords.size).toBe(0);
    const reviewer = await signIn(fixture);
    const approved = await fetch(`${fixture.origin}/api/reviewer/work/${job.id}/decision`, { method: "POST", headers: decisionHeaders(fixture, reviewer.session!), body: JSON.stringify({ decision: "approve", proposalHash: job.proposalHash }) });
    expect(approved.status).toBe(200);
    const receipt = ((await approved.json()) as { job: WorkJob }).job.receipt;
    await next.client.close();
    await fixture.restart();
    const final = await connect(fixture);
    expect((await call<{ job: WorkJob }>(final.client, "get_work", { workId: job.id })).value.job.receipt).toEqual(receipt);
    expect(fixture.taskRecords.size).toBe(1);
  });
});
