import { mkdir, writeFile } from "node:fs/promises";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test, type APIRequestContext } from "@playwright/test";

import type { WorkAssistantContext } from "../lib/work/context";
import type { WorkJob } from "../lib/work/service";
import { createWorkHostedFhirAdapter } from "../scripts/work-hosted-fhir";
import { createHostedWorkFixture } from "../test/hosted-work-fixture";

Object.assign(process.env, { NODE_ENV: "test" });
const toolNames = ["cancel_work", "get_work", "propose_work", "read_work_context"];
const fixtureBackend = process.env.LASTEHR_HOSTED_E2E_BACKEND === "fixture";
type Fixture = Awaited<ReturnType<typeof createHostedWorkFixture>>;
const createFixture = () => createHostedWorkFixture(fixtureBackend ? {} : { committer: createWorkHostedFhirAdapter({ baseUrl: "http://127.0.0.1:8080/fhir" }) });

async function connect(fixture: Fixture, identity: "a" | "b" = "a") {
  const client = new Client({ name: "hosted-work-sdk-test-client", version: "0.1.0" }, { capabilities: {} });
  await client.connect(new StreamableHTTPClientTransport(new URL(fixture.mcpUrl), { requestInit: { headers: { authorization: `Bearer ${await fixture.token(identity)}` } } }));
  return client;
}
async function call<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).not.toBe(true);
  return result.structuredContent as T;
}
async function propose(client: Client, description?: string) {
  const { context } = await call<{ context: WorkAssistantContext }>(client, "read_work_context", {});
  const input = {
    description: description || `Care-team review of the invented ${context.observation.value}${context.observation.unit} result dated ${context.observation.effectiveDateTime.slice(0, 10)}. Do not contact the patient.`,
    sourceReference: context.observation.reference, sourceVersionId: context.observation.versionId,
    dueDate: "2026-11-01", idempotencyKey: crypto.randomUUID(),
  };
  const result = await call<{ job: WorkJob }>(client, "propose_work", input);
  expect(result.job.state).toBe("awaiting_review");
  const replay = await call<{ job: WorkJob }>(client, "propose_work", input);
  expect(replay.job).toEqual(result.job);
  return result.job;
}
async function tasks(request: APIRequestContext, workId: string, fixture: Fixture) {
  if (fixtureBackend) {
    const record = fixture.taskRecords.get(workId);
    return { total: record ? 1 : 0, entry: record ? [{ resource: record.resource }] : [] };
  }
  const query = new URLSearchParams({ identifier: `https://lastehr.com/work-lab/job|${workId}`, _count: "2", _total: "accurate" });
  const response = await request.get(`http://127.0.0.1:8080/fhir/Task?${query}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

test("hosted HTTP MCP survives separate OIDC browser review and two service restarts with one exact synthetic Task", async ({ browser, request }) => {
  const fixture = await createFixture();
  const reviewContext = await browser.newContext();
  const reviewer = await reviewContext.newPage();
  const errors: string[] = [];
  reviewer.on("pageerror", (error) => errors.push(error.message));
  let client = await connect(fixture);
  try {
    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual(toolNames);
    const job = await propose(client);
    expect((await tasks(request, job.id, fixture)).total).toBe(0);
    const beforeVerifiedAt = new Date().toISOString();
    await client.close();
    await fixture.restart();
    await reviewer.goto(fixture.origin);
    await reviewer.getByRole("link", { name: "Sign in to review", exact: true }).click();
    await expect(reviewer.locator("#inbox")).toBeVisible();
    const card = reviewer.locator(`[data-job-id="${job.id}"]`);
    expect(JSON.parse(await card.locator("pre").first().innerText())).toEqual(job.proposal);
    await card.getByRole("button", { name: "Approve and save", exact: true }).click();
    await expect(card.getByText("Saved to FHIR", { exact: true })).toBeVisible();
    client = await connect(fixture);
    const result = await call<{ job: WorkJob; message: string }>(client, "get_work", { workId: job.id });
    expect(result.job.state).toBe("succeeded");
    expect(result.job.proposalHash).toBe(job.proposalHash);
    const found = await tasks(request, job.id, fixture);
    expect(found.total).toBe(1);
    const { id, meta, ...savedFields } = found.entry[0].resource;
    expect(savedFields).toEqual(job.proposal);
    expect(result.job.receipt).toMatchObject({ resourceType: "Task", id, versionId: meta.versionId });
    await card.screenshot({ path: "artifacts/work-lab/hosted-work-approved.png" });
    await client.close();
    await fixture.restart();
    client = await connect(fixture);
    const recovered = await call<{ job: WorkJob }>(client, "get_work", { workId: job.id });
    expect(recovered.job.receipt).toEqual(result.job.receipt);
    expect((await tasks(request, job.id, fixture)).total).toBe(1);
    const oldSession = await reviewContext.request.get(`${fixture.origin}/api/reviewer/session`);
    expect(oldSession.status()).toBe(401);
    await mkdir("artifacts/work-lab", { recursive: true });
    await writeFile("artifacts/work-lab/hosted-work-browser.json", JSON.stringify({
      syntheticOnly: true, backend: fixtureBackend ? "in-memory test fixture" : "local HAPI", client: "MCP SDK scripted HTTP test client", realModelCall: false,
      reviewer: "automated browser with test OIDC issuer", realGrokSession: false,
      workId: job.id, proposalHash: job.proposalHash, beforeApproval: { verifiedAt: beforeVerifiedAt, matchingTasks: 0 },
      afterApproval: { verifiedAt: new Date().toISOString(), matchingTasks: 1, exactApprovedFieldsMatch: true, receipt: result.job.receipt },
      restartedWhilePending: true, restartedAfterReceipt: true, previousReviewerSessionRejectedAfterRestart: true,
    }, null, 2) + "\n");
    expect(errors).toEqual([]);
  } finally { await client.close(); await reviewContext.close(); await fixture.close(); }
});

test("hosted reviewer sees literal draft text; declined and cancelled work create no synthetic Task", async ({ browser, request }) => {
  const fixture = await createFixture();
  const client = await connect(fixture);
  const foreign = await connect(fixture, "b");
  const reviewContext = await browser.newContext();
  const reviewer = await reviewContext.newPage();
  try {
    const job = await propose(client, "Invented review request: <img src=x onerror='alert(1)'>. Do not contact anyone.");
    expect((await foreign.callTool({ name: "get_work", arguments: { workId: job.id } })).isError).toBe(true);
    expect((await foreign.callTool({ name: "cancel_work", arguments: { workId: job.id } })).isError).toBe(true);
    expect((await client.callTool({ name: "approve_work", arguments: { workId: job.id, proposalHash: job.proposalHash } })).isError).toBe(true);
    await reviewer.goto(fixture.origin);
    await reviewer.getByRole("link", { name: "Sign in to review", exact: true }).click();
    await expect(reviewer.locator("#inbox")).toBeVisible();
    const card = reviewer.locator(`[data-job-id="${job.id}"]`);
    await expect(card.getByText(job.proposal.description, { exact: true })).toBeVisible();
    await expect(card.locator("img")).toHaveCount(0);
    await card.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(card.getByText("Declined", { exact: true })).toBeVisible();
    expect((await call<{ job: WorkJob }>(client, "get_work", { workId: job.id })).job.state).toBe("denied");
    expect((await tasks(request, job.id, fixture)).total).toBe(0);
    const other = await propose(client);
    expect((await call<{ job: WorkJob }>(client, "cancel_work", { workId: other.id })).job.state).toBe("cancelled");
    expect((await tasks(request, other.id, fixture)).total).toBe(0);
  } finally { await client.close(); await foreign.close(); await reviewContext.close(); await fixture.close(); }
});
