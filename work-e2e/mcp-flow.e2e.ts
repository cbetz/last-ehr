import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, test, type APIRequestContext } from "@playwright/test";

import type { WorkAssistantContext } from "../lib/work/context";
import type { WorkJob } from "../lib/work/service";

const origin = "http://127.0.0.1:3301";
const assistantKey = "assistant-browser-test-00000000000000000000";
const reviewerKey = "reviewer-browser-test-000000000000000000000";
const toolNames = ["cancel_work", "get_work", "propose_work", "read_work_context"];

async function connect() {
  const client = new Client({ name: "last-work-external-test", version: "0.1.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", createRequire(resolve("package.json")).resolve("tsx"), resolve("scripts/work-mcp.ts"), "--url", origin],
    cwd: tmpdir(),
    env: { LASTEHR_WORK_ASSISTANT_KEY: assistantKey },
    stderr: "ignore",
  });
  await client.connect(transport);
  return client;
}

async function call<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toBeTruthy();
  return result.structuredContent as T;
}

async function propose(client: Client) {
  const { context } = await call<{ context: WorkAssistantContext }>(client, "read_work_context", {});
  const args = {
    description: `Care team review of the invented ${context.observation.label}: ${context.observation.value}${context.observation.unit}. MCP evaluation ${crypto.randomUUID()}.`,
    dueDate: "2026-11-01",
    sourceReference: context.observation.reference,
    sourceVersionId: context.observation.versionId,
    idempotencyKey: crypto.randomUUID(),
  };
  const { job } = await call<{ job: WorkJob }>(client, "propose_work", args);
  expect(job.state).toBe("awaiting_review");
  const duplicate = await call<{ job: WorkJob }>(client, "propose_work", args);
  expect(duplicate.job).toEqual(job);
  return job;
}

async function tasks(request: APIRequestContext, workId: string) {
  const query = new URLSearchParams({ identifier: `https://lastehr.com/work-lab/job|${workId}`, _count: "2", _total: "accurate" });
  const response = await request.get(`http://127.0.0.1:8080/fhir/Task?${query}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

test("external MCP process disconnects before separate browser review and reconnects to one verified Task", async ({ browser, request }) => {
  let client = await connect();
  const reviewContext = await browser.newContext();
  const reviewer = await reviewContext.newPage();
  const errors: string[] = [];
  reviewer.on("pageerror", (error) => errors.push(error.message));
  try {
    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual(toolNames);
    expect(client.getServerCapabilities()).not.toHaveProperty("experimental");
    const job = await propose(client);
    expect((await tasks(request, job.id)).total).toBe(0);
    await client.close();
    await reviewer.goto(origin);
    await reviewer.getByLabel("Reviewer sign-in key").fill(reviewerKey);
    await reviewer.getByRole("button", { name: "Open inbox", exact: true }).click();
    const card = reviewer.locator(`[data-job-id="${job.id}"]`);
    expect(JSON.parse(await card.locator("pre").first().innerText())).toEqual(job.proposal);
    await card.getByRole("button", { name: "Approve and save Task", exact: true }).click();
    await expect(card.getByText("Saved to FHIR", { exact: true })).toBeVisible();
    client = await connect();
    const result = await call<{ job: WorkJob; message: string }>(client, "get_work", { workId: job.id });
    expect(result.job.state).toBe("succeeded");
    expect(result.job.proposalHash).toBe(job.proposalHash);
    expect(result.message).toContain(`independently verified Task/${result.job.receipt!.id}`);
    const found = await tasks(request, job.id);
    expect(found.total).toBe(1);
    const { id, meta, ...savedFields } = found.entry[0].resource;
    expect(savedFields).toEqual(job.proposal);
    expect(id).toBe(result.job.receipt!.id);
    expect(meta.versionId).toBe(result.job.receipt!.versionId);
    await card.screenshot({ path: "artifacts/work-lab/external-mcp-approved.png" });
    expect(errors).toEqual([]);
  } finally { await client.close(); await reviewContext.close(); }
});

test("external MCP has no reviewer tool; declined and cancelled drafts create no Task", async ({ browser, request }) => {
  const client = await connect();
  const reviewContext = await browser.newContext();
  const reviewer = await reviewContext.newPage();
  try {
    const job = await propose(client);
    const forbidden = await client.callTool({ name: "approve_work", arguments: { workId: job.id, proposalHash: job.proposalHash } });
    expect(forbidden.isError).toBe(true);
    expect((await tasks(request, job.id)).total).toBe(0);
    await reviewer.goto(origin);
    await reviewer.getByLabel("Reviewer sign-in key").fill(reviewerKey);
    await reviewer.getByRole("button", { name: "Open inbox", exact: true }).click();
    const card = reviewer.locator(`[data-job-id="${job.id}"]`);
    await card.getByRole("button", { name: "Decline", exact: true }).click();
    const denied = await call<{ job: WorkJob }>(client, "get_work", { workId: job.id });
    expect(denied.job.state).toBe("denied");
    expect(denied.job.receipt).toBeUndefined();
    expect((await tasks(request, job.id)).total).toBe(0);
    const other = await propose(client);
    const cancelled = await call<{ job: WorkJob }>(client, "cancel_work", { workId: other.id });
    expect(cancelled.job.state).toBe("cancelled");
    expect((await tasks(request, other.id)).total).toBe(0);
  } finally { await client.close(); await reviewContext.close(); }
});
