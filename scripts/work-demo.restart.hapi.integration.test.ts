import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { AssistantRun } from "../lib/work/assistant";
import type { WorkJob } from "../lib/work/service";
import type { WorkDemoFixture } from "./work-demo-fhir";

const runHapiE2E = process.env.RUN_HAPI_E2E === "1";
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const loader = join(repositoryRoot, "node_modules/tsx/dist/loader.mjs");
const cli = join(repositoryRoot, "scripts/work-demo.ts");
// Deliberately synthetic, stable across each child restart and never logged.
const assistantKey = "restart-proof-assistant-0000000000000000000000000000";
const reviewerKey = "restart-proof-reviewer-11111111111111111111111111111";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
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

async function stopChild(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, 5_000)) return;
  child.kill("SIGKILL");
  if (!await waitForExit(child, 3_000)) throw new Error("The local work lab test process did not stop.");
}

async function startChild(port: number, storePath: string, scriptedAgent = false): Promise<ChildProcess> {
  const child = spawn(process.execPath, ["--import", loader, cli, "--port", String(port), "--store", storePath, ...(scriptedAgent ? ["--scripted-agent"] : [])], {
    cwd: repositoryRoot,
    // No application environment, model keys, FHIR credentials or .env path is inherited.
    env: { NODE_ENV: "test", LASTEHR_WORK_ASSISTANT_KEY: assistantKey, LASTEHR_WORK_REVIEWER_KEY: reviewerKey },
    // The CLI prints local keys at startup. Discard both streams instead of
    // capturing them in a test assertion or adding them to failure diagnostics.
    stdio: "ignore",
  });
  let spawnFailed = false;
  child.once("error", () => { spawnFailed = true; });
  try {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (spawnFailed || child.exitCode !== null || child.signalCode !== null) throw new Error("The local work lab CLI could not start.");
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, { redirect: "error", credentials: "omit", signal: AbortSignal.timeout(500) });
        if (response.ok) {
          const result = await response.json() as { status?: string; mode?: string };
          if (result.status === "ready" && result.mode === "synthetic-only") return child;
        }
      } catch { /* Expected while the child initializes the local fixture and store. */ }
      await new Promise((accept) => setTimeout(accept, 100));
    }
    throw new Error("The local work lab CLI did not become ready within the bounded startup wait.");
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}

async function taskRead(jobId: string): Promise<{ total: number; entry?: Array<{ resource: Record<string, unknown> }> }> {
  const query = new URLSearchParams({ identifier: `https://lastehr.com/work-lab/job|${jobId}`, _count: "2", _total: "accurate" });
  const response = await fetch(`http://127.0.0.1:8080/fhir/Task?${query}`, {
    headers: { Accept: "application/fhir+json" }, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(5_000),
  });
  expect(response.status).toBe(200);
  return await response.json();
}

describe.skipIf(!runHapiE2E)("actual work lab CLI restart against synthetic HAPI", () => {
  it("retains the pending reviewed hash and completed receipt across separate processes without a duplicate Task", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lastehr-work-restart-"));
    await chmod(directory, 0o700);
    const storePath = join(directory, "work.sqlite");
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const assistantHeaders = { authorization: `Bearer ${assistantKey}` };
    let child: ChildProcess | undefined;
    const request = (path: string, init: RequestInit = {}) => fetch(`${origin}${path}`, {
      ...init, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(10_000),
    });
    try {
      child = await startChild(port, storePath);
      const fixtureResponse = await request("/api/fixture", { headers: assistantHeaders });
      expect(fixtureResponse.status).toBe(200);
      const { fixture } = await fixtureResponse.json() as { fixture: WorkDemoFixture };
      const submitted = await request("/api/work", {
        method: "POST",
        headers: { ...assistantHeaders, "content-type": "application/json", "idempotency-key": randomUUID() },
        body: JSON.stringify({ patientId: fixture.patientId, source: fixture.source, description: "Synthetic restart proof: review the invented result and arrange follow-up.", dueDate: "2026-11-01" }),
      });
      expect(submitted.status).toBe(201);
      const { job } = await submitted.json() as { job: WorkJob };
      expect(job.state).toBe("awaiting_review");
      expect(await taskRead(job.id)).toMatchObject({ total: 0 });

      await stopChild(child);
      child = await startChild(port, storePath);
      const pendingResponse = await request(`/api/work/${job.id}`, { headers: assistantHeaders });
      expect(pendingResponse.status).toBe(200);
      const { job: pending } = await pendingResponse.json() as { job: WorkJob };
      expect(pending).toEqual(job);
      expect(pending.proposalHash).toBe(job.proposalHash);
      expect(await taskRead(job.id)).toMatchObject({ total: 0 });

      const login = await request("/api/reviewer/session", {
        method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ key: reviewerKey }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get("set-cookie")?.split(";")[0];
      expect(cookie).toBeTruthy();
      const decision = await request(`/api/reviewer/work/${job.id}/decision`, {
        method: "POST", headers: { origin, cookie: cookie!, "content-type": "application/json" }, body: JSON.stringify({ decision: "approve", proposalHash: pending.proposalHash }),
      });
      expect(decision.status).toBe(200);
      const { job: completed } = await decision.json() as { job: WorkJob };
      expect(completed.state).toBe("succeeded");
      expect(completed.proposalHash).toBe(job.proposalHash);
      expect(completed.decision?.subject).toBe("reviewer-lab");
      const persisted = await taskRead(job.id);
      expect(persisted.total).toBe(1);
      const resource = persisted.entry![0].resource;
      const { id, meta, ...reviewed } = resource;
      expect(reviewed).toEqual(job.proposal);
      expect(id).toBe(completed.receipt?.id);
      expect(meta).toMatchObject({ versionId: completed.receipt?.versionId });

      await stopChild(child);
      child = await startChild(port, storePath);
      const receiptResponse = await request(`/api/work/${job.id}`, { headers: assistantHeaders });
      expect(receiptResponse.status).toBe(200);
      const { job: recovered } = await receiptResponse.json() as { job: WorkJob };
      expect(recovered).toEqual(completed);
      expect(recovered.receipt).toEqual(completed.receipt);
      expect(await taskRead(job.id)).toMatchObject({ total: 1 });
    } finally {
      await stopChild(child);
      await rm(directory, { recursive: true, force: true });
    }
  }, 90_000);

  it("retains a model-generated assistant run, exact reviewed proposal, and verified receipt across three CLI processes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lastehr-assistant-restart-"));
    await chmod(directory, 0o700);
    const storePath = join(directory, "work.sqlite");
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const assistantHeaders = { authorization: `Bearer ${assistantKey}` };
    const submissionKey = randomUUID();
    const prompt = "Read the selected synthetic chart and prepare a follow-up Task for the HbA1c result, due 2026-11-01.";
    let child: ChildProcess | undefined;
    const request = (path: string, init: RequestInit = {}) => fetch(`${origin}${path}`, {
      ...init, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(10_000),
    });
    const readRun = async (id: string): Promise<AssistantRun> => {
      const response = await request(`/api/assistant/runs/${id}`, { headers: assistantHeaders });
      expect(response.status).toBe(200);
      return (await response.json() as { run: AssistantRun }).run;
    };
    try {
      // The explicit test-only model exercises the real tool loop and HAPI
      // adapter, without inheriting or using any external model credential.
      child = await startChild(port, storePath, true);
      const submitted = await request("/api/assistant/runs", {
        method: "POST", headers: { ...assistantHeaders, "content-type": "application/json", "idempotency-key": submissionKey },
        body: JSON.stringify({ prompt }),
      });
      expect(submitted.status).toBe(202);
      const { run: initial } = await submitted.json() as { run: AssistantRun };
      expect(initial.state).toBe("generating");
      let pending = initial;
      const generationDeadline = Date.now() + 15_000;
      while (pending.state === "generating" && Date.now() < generationDeadline) {
        await new Promise((accept) => setTimeout(accept, 50));
        pending = await readRun(initial.id);
      }
      expect(pending.state).toBe("awaiting_review");
      expect(pending.prompt).toBe(prompt);
      expect(pending.modelLabel).toBe("SCRIPTED TEST — no model provider");
      expect(pending.events.map((event) => event.type)).toEqual(["started", "chart_read", "drafted", "awaiting_review"]);
      expect(pending.job?.input.description).toContain("6.4%");
      const job = pending.job!;
      expect(job.input.source.reference).toMatch(/^Observation\//);
      expect(job.proposal.input[0].valueString).toBe(`${job.input.source.reference}/_history/${job.input.source.versionId}`);
      expect(await taskRead(job.id)).toMatchObject({ total: 0 });

      await stopChild(child);
      child = await startChild(port, storePath, true);
      const recoveredPending = await readRun(initial.id);
      expect(recoveredPending).toEqual(pending);
      expect(recoveredPending.job?.proposalHash).toBe(job.proposalHash);
      const replay = await request("/api/assistant/runs", {
        method: "POST", headers: { ...assistantHeaders, "content-type": "application/json", "idempotency-key": submissionKey },
        body: JSON.stringify({ prompt }),
      });
      expect(replay.status).toBe(202);
      expect((await replay.json() as { run: AssistantRun }).run.id).toBe(initial.id);
      const runList = await request("/api/assistant/runs", { headers: assistantHeaders });
      expect(runList.status).toBe(200);
      expect((await runList.json() as { runs: AssistantRun[] }).runs.map((run) => run.id)).toEqual([initial.id]);
      expect(await taskRead(job.id)).toMatchObject({ total: 0 });

      const login = await request("/api/reviewer/session", {
        method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ key: reviewerKey }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get("set-cookie")?.split(";")[0];
      expect(cookie).toBeTruthy();
      const decision = await request(`/api/reviewer/work/${job.id}/decision`, {
        method: "POST", headers: { origin, cookie: cookie!, "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve", proposalHash: recoveredPending.job!.proposalHash }),
      });
      expect(decision.status).toBe(200);
      const { job: completedJob } = await decision.json() as { job: WorkJob };
      expect(completedJob.state).toBe("succeeded");
      expect(completedJob.decision?.subject).toBe("reviewer-lab");
      const completed = await readRun(initial.id);
      expect(completed.state).toBe("succeeded");
      expect(completed.job).toEqual(completedJob);
      expect(completed.message).toContain(`independently verified Task/${completedJob.receipt!.id}`);
      expect(completed.message).toContain("does not mean the patient has been contacted");
      const persisted = await taskRead(job.id);
      expect(persisted.total).toBe(1);
      const { id, meta, ...reviewed } = persisted.entry![0].resource;
      expect(reviewed).toEqual(job.proposal);
      expect(id).toBe(completedJob.receipt!.id);
      expect(meta).toMatchObject({ versionId: completedJob.receipt!.versionId });

      await stopChild(child);
      child = await startChild(port, storePath, true);
      const recoveredCompleted = await readRun(initial.id);
      expect(recoveredCompleted).toEqual(completed);
      expect(recoveredCompleted.job?.receipt).toEqual(completedJob.receipt);
      expect(await taskRead(job.id)).toMatchObject({ total: 1 });
    } finally {
      await stopChild(child);
      await rm(directory, { recursive: true, force: true });
    }
  }, 90_000);
});
