import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

import type { WorkAssistantContext } from "../lib/work/context";
import type { WorkJob } from "../lib/work/service";

const runHapiE2E = process.env.RUN_HAPI_E2E === "1";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const loader = createRequire(import.meta.url).resolve("tsx");
const assistantKey = "mcp-restart-assistant-0000000000000000000000000000";
const reviewerKey = "mcp-restart-reviewer-11111111111111111111111111111";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  const address = server.address();
  if (!address || typeof address === "string" || address.port < 1024) throw new Error("Could not reserve a local test port.");
  const port = address.port;
  await new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept()));
  return port;
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((accept) => {
    const onExit = () => { clearTimeout(timer); accept(true); };
    const timer = setTimeout(() => { child.off("exit", onExit); accept(false); }, timeoutMs);
    child.once("exit", onExit);
  });
}

async function stopLab(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, 5_000)) return;
  child.kill("SIGKILL");
  if (!await waitForExit(child, 3_000)) throw new Error("The Work Lab test process did not stop.");
}

async function startLab(port: number, storePath: string): Promise<ChildProcess> {
  const child = spawn(process.execPath, ["--import", loader, join(root, "scripts/work-demo.ts"), "--port", String(port), "--store", storePath], {
    cwd: root,
    // Stable synthetic role keys only. No provider key or app .env path.
    env: { NODE_ENV: "test", LASTEHR_WORK_ASSISTANT_KEY: assistantKey, LASTEHR_WORK_REVIEWER_KEY: reviewerKey },
    // The local lab prints disposable role keys. Never collect those logs.
    stdio: "ignore",
  });
  let spawnFailed = false;
  child.once("error", () => { spawnFailed = true; });
  try {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (spawnFailed || child.exitCode !== null || child.signalCode !== null) throw new Error("The Work Lab CLI could not start.");
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, { redirect: "error", credentials: "omit", signal: AbortSignal.timeout(500) });
        if (response.ok) {
          const body = await response.json() as { status?: string; mode?: string };
          if (body.status === "ready" && body.mode === "synthetic-only") return child;
        }
      } catch { /* The fixture/store may still be initializing. */ }
      await new Promise((accept) => setTimeout(accept, 100));
    }
    throw new Error("The Work Lab CLI did not become ready within the bounded startup wait.");
  } catch (error) { await stopLab(child); throw error; }
}

async function connectMcp(origin: string, cwd: string): Promise<Client> {
  const client = new Client({ name: "synthetic-work-restart-proof", version: "1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", loader, join(root, "scripts/work-mcp.ts"), "--url", origin],
    cwd,
    // The SDK adds basic OS environment variables; no reviewer or provider
    // credential is inherited. This process can only act as the assistant.
    env: { NODE_ENV: "test", LASTEHR_WORK_ASSISTANT_KEY: assistantKey },
    stderr: "ignore",
  });
  try { await client.connect(transport); return client; }
  catch (error) { await client.close(); throw error; }
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await client.callTool({ name, arguments: args }) as CallToolResult;
  expect(response.isError).toBeUndefined();
  expect(response.structuredContent).toBeDefined();
  expect(response.content[0].type).toBe("text");
  expect(JSON.parse((response.content[0] as { text: string }).text)).toEqual(response.structuredContent);
  return response.structuredContent!;
}

async function taskSearch(jobId: string): Promise<{ total: number; entry?: Array<{ resource: Record<string, unknown> }> }> {
  const query = new URLSearchParams({ identifier: `https://lastehr.com/work-lab/job|${jobId}`, _count: "2", _total: "accurate" });
  const response = await fetch(`http://127.0.0.1:8080/fhir/Task?${query}`, { headers: { accept: "application/fhir+json" }, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(5_000) });
  expect(response.status).toBe(200);
  return response.json();
}

describe.skipIf(!runHapiE2E)("actual stdio Work MCP and Work Lab CLI restart against synthetic HAPI", () => {
  it("recovers the same pending draft and reviewed receipt across three independent MCP/worker processes with one exact FHIR Task", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lastehr-work-mcp-restart-"));
    await chmod(directory, 0o700);
    const storePath = join(directory, "work.sqlite");
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const request = (path: string, init: RequestInit = {}) => fetch(`${origin}${path}`, { ...init, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(10_000) });
    let worker: ChildProcess | undefined;
    let client: Client | undefined;
    try {
      worker = await startLab(port, storePath);
      client = await connectMcp(origin, directory);
      expect(client.getServerCapabilities()).toEqual({ tools: {} });
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["read_work_context", "propose_work", "get_work", "cancel_work"]);
      const refused = await client.callTool({ name: "approve_work", arguments: {} }) as CallToolResult;
      expect(refused.isError).toBe(true);
      const context = (await call(client, "read_work_context", {})).context as WorkAssistantContext;
      const proposal = {
        description: "Synthetic MCP restart proof: ask the care team to review the invented HbA1c result and arrange follow-up.",
        dueDate: "2026-11-01", sourceReference: context.observation.reference,
        sourceVersionId: context.observation.versionId, idempotencyKey: `mcp-restart:${randomUUID()}`,
      };
      const job = (await call(client, "propose_work", proposal)).job as WorkJob;
      expect(job.state).toBe("awaiting_review");
      expect(job.proposal.input[0].valueString).toBe(`${context.observation.reference}/_history/${context.observation.versionId}`);
      expect((await call(client, "propose_work", proposal)).job).toEqual(job);
      expect(await taskSearch(job.id)).toMatchObject({ total: 0 });
      await client.close(); client = undefined;
      await stopLab(worker); worker = undefined;

      worker = await startLab(port, storePath);
      client = await connectMcp(origin, directory);
      // This newly connected assistant retrieves durable state without relying
      // on old MCP session memory or another model/chart read.
      const pending = (await call(client, "get_work", { workId: job.id })).job as WorkJob;
      expect(pending).toEqual(job);
      expect(pending.proposalHash).toBe(job.proposalHash);
      expect(await taskSearch(job.id)).toMatchObject({ total: 0 });

      // Separate scripted reviewer role. Its cookie/key never enters the MCP
      // process or any tool argument, and this is not a claimed human review.
      const login = await request("/api/reviewer/session", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ key: reviewerKey }) });
      expect(login.status).toBe(200);
      const cookie = login.headers.get("set-cookie")?.split(";")[0];
      expect(cookie).toBeTruthy();
      const decision = await request(`/api/reviewer/work/${job.id}/decision`, {
        method: "POST", headers: { origin, cookie: cookie!, "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve", proposalHash: pending.proposalHash }),
      });
      expect(decision.status).toBe(200);
      const completed = (await decision.json() as { job: WorkJob }).job;
      expect(completed.state).toBe("succeeded");
      expect(completed.decision?.subject).toBe("reviewer-lab");
      expect(completed.proposalHash).toBe(job.proposalHash);
      const completion = await call(client, "get_work", { workId: job.id });
      expect(completion.job).toEqual(completed);
      expect(completion.message).toContain(`independently verified Task/${completed.receipt!.id}`);
      const found = await taskSearch(job.id);
      expect(found.total).toBe(1);
      const direct = await fetch(`http://127.0.0.1:8080/fhir/Task/${completed.receipt!.id}`, { headers: { accept: "application/fhir+json" }, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(5_000) });
      expect(direct.status).toBe(200);
      const persisted = await direct.json() as Record<string, unknown>;
      expect(found.entry![0].resource).toEqual(persisted);
      const { id, meta, ...reviewed } = persisted;
      expect(reviewed).toEqual(job.proposal);
      expect(id).toBe(completed.receipt!.id);
      expect(meta).toMatchObject({ versionId: completed.receipt!.versionId });
      await client.close(); client = undefined;
      await stopLab(worker); worker = undefined;

      worker = await startLab(port, storePath);
      client = await connectMcp(origin, directory);
      const recovered = (await call(client, "get_work", { workId: job.id })).job as WorkJob;
      expect(recovered).toEqual(completed);
      expect(recovered.receipt).toEqual(completed.receipt);
      expect(await taskSearch(job.id)).toMatchObject({ total: 1 });
    } finally {
      await client?.close();
      await stopLab(worker);
      await rm(directory, { recursive: true, force: true });
    }
  }, 90_000);
});
