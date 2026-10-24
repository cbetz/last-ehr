import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { MockLanguageModelV3 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantWorkRuntime, type AssistantRun, type WorkAssistantContext } from "./assistant";
import { createWorkScriptedModel } from "./assistant-scripted-model";
import { DurableWorkService, type WorkActor, type WorkCommitter, type WorkTaskRecord } from "./service";

const assistant: WorkActor = { tenantId: "synthetic-lab", subject: "assistant", role: "assistant" };
const reviewer: WorkActor = { tenantId: "synthetic-lab", subject: "reviewer", role: "reviewer" };
const context: WorkAssistantContext = {
  patient: { reference: "Patient/invented-patient", label: "Alex Synthetic Worklab", dateOfBirth: "2000-01-01" },
  observation: { reference: "Observation/invented-result", versionId: "7", label: "Hemoglobin A1c", value: 6.4, unit: "%", effectiveDateTime: "2026-01-01T12:00:00Z" },
};
const prompt = "Prepare a follow-up Task for the selected synthetic result, due 2026-11-01.";
const proposal = { description: "Arrange follow-up of HbA1c 6.4%.", dueDate: "2026-11-01", sourceReference: context.observation.reference, sourceVersionId: context.observation.versionId };
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };

function call(toolName: string, input: unknown) {
  return { content: [{ type: "tool-call" as const, toolCallId: crypto.randomUUID(), toolName, input: JSON.stringify(input) }], finishReason: { unified: "tool-calls" as const, raw: "test" }, usage, warnings: [] };
}

const directories: string[] = [];
const runtimes: AssistantWorkRuntime[] = [];
const services: DurableWorkService[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const service of services.splice(0)) { try { service.close(); } catch { /* already closed */ } }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function setup(model = createWorkScriptedModel(), timeoutMs = 1000) {
  const directory = mkdtempSync(join(tmpdir(), "last-assistant-test-"));
  directories.push(directory);
  const storePath = join(directory, "private", "work.sqlite");
  const resources = new Map<string, WorkTaskRecord[]>();
  const committer: WorkCommitter = {
    validateContext: vi.fn(async () => true),
    findByJobId: vi.fn(async ({ jobId }) => structuredClone(resources.get(jobId) ?? [])),
    conditionalCreate: vi.fn(async ({ jobId, proposal: task }) => {
      const record = { id: "verified-task", versionId: "1", resource: { ...structuredClone(task), id: "verified-task", meta: { versionId: "1" } } };
      resources.set(jobId, [record]);
      return record;
    }),
  };
  const service = new DurableWorkService({ storePath, reviewer, committer });
  services.push(service);
  const readContext = vi.fn(async () => structuredClone(context));
  const open = (actor = assistant) => {
    const runtime = new AssistantWorkRuntime({ storePath, service, actor, readContext, model, modelLabel: "scripted test fixture", timeoutMs });
    runtimes.push(runtime);
    return runtime;
  };
  return { directory, storePath, resources, committer, service, readContext, open, runtime: open() };
}

async function settled(runtime: AssistantWorkRuntime, id: string): Promise<AssistantRun> {
  let run = await runtime.get(id);
  await vi.waitFor(async () => {
    run = await runtime.get(id);
    expect(run.state).not.toBe("generating");
  }, { timeout: 3000, interval: 5 });
  return run;
}

describe("bounded model-backed assistant work", () => {
  it("runs an actual tool loop, reads chart context, drafts a proposal, and reports only the independently verified receipt", async () => {
    const f = setup();
    const initial = await f.runtime.start(prompt, "request-1");
    expect(initial.state).toBe("generating");
    const pending = await settled(f.runtime, initial.id);
    expect(pending.state).toBe("awaiting_review");
    expect(f.readContext).toHaveBeenCalledTimes(1);
    expect(pending.events.map((event) => event.type)).toEqual(["started", "chart_read", "drafted", "awaiting_review"]);
    expect(pending.job?.input).toMatchObject({ patientId: "invented-patient", source: { reference: "Observation/invented-result", versionId: "7" }, dueDate: "2026-11-01" });
    expect(pending.job?.input.description).toContain("6.4%");
    expect(f.committer.conditionalCreate).not.toHaveBeenCalled();
    expect(pending.message).toContain("No Task has been saved");
    const job = pending.job!;
    await f.service.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash });
    const completed = await f.runtime.get(initial.id);
    expect(completed).toMatchObject({ state: "succeeded", job: { receipt: { id: "verified-task" } } });
    expect(completed.message).toContain("independently verified Task/verified-task");
    expect(completed.message).toContain("does not mean the patient has been contacted");
    expect(f.committer.conditionalCreate).toHaveBeenCalledTimes(1);
    expect(statSync(f.storePath).mode & 0o777).toBe(0o600);
    expect(statSync(join(f.directory, "private")).mode & 0o777).toBe(0o700);
  });

  it("reports reviewer denial without a FHIR write", async () => {
    const f = setup();
    const pending = await settled(f.runtime, (await f.runtime.start(prompt, "denied")).id);
    await f.service.decide(reviewer, pending.job!.id, { decision: "deny", proposalHash: pending.job!.proposalHash });
    const denied = await f.runtime.get(pending.id);
    expect(denied.state).toBe("denied");
    expect(denied.message).toContain("declined");
    expect(f.committer.conditionalCreate).not.toHaveBeenCalled();
  });

  it("enforces context-before-proposal even when a model ignores the forced first tool", async () => {
    const model = new MockLanguageModelV3({ doGenerate: async () => call("propose_follow_up", proposal) });
    const f = setup(model);
    const run = await settled(f.runtime, (await f.runtime.start(prompt, "no-read")).id);
    expect(run.state).toBe("failed");
    expect(run.job).toBeUndefined();
    expect(f.readContext).not.toHaveBeenCalled();
    expect(await f.service.list(reviewer)).toHaveLength(0);
    expect(model.doGenerateCalls.length).toBeLessThanOrEqual(4);
  });

  it("rejects a mismatched chart citation without accepting a proposal", async () => {
    let step = 0;
    const f = setup(new MockLanguageModelV3({ doGenerate: async () => ++step === 1 ? call("read_chart_context", {}) : call("propose_follow_up", { ...proposal, sourceVersionId: "999" }) }));
    const run = await settled(f.runtime, (await f.runtime.start(prompt, "bad-citation")).id);
    expect(run).toMatchObject({ state: "failed", failureCode: "invalid_proposal" });
    expect(run.job).toBeUndefined();
    expect(await f.service.list(reviewer)).toHaveLength(0);
    expect(step).toBe(4);
  });

  it("rejects impossible dates before persisting a proposal and keeps get/list readable", async () => {
    let step = 0;
    const f = setup(new MockLanguageModelV3({ doGenerate: async () => ++step === 1 ? call("read_chart_context", {}) : call("propose_follow_up", { ...proposal, dueDate: "2026-02-30" }) }));
    const run = await settled(f.runtime, (await f.runtime.start(prompt, "invalid-date")).id);
    expect(run.state).toBe("failed");
    expect(run.job).toBeUndefined();
    expect((await f.runtime.list())[0].id).toBe(run.id);
    expect(await f.service.list(reviewer)).toHaveLength(0);
  });

  it("rejects an overbroad or invalid chart projection and never discloses it to the next model step", async () => {
    const model = createWorkScriptedModel();
    const f = setup(model);
    f.readContext.mockResolvedValue({ ...context, extraSecret: "must-not-reach-model" } as WorkAssistantContext);
    const run = await settled(f.runtime, (await f.runtime.start(prompt, "overbroad-context")).id);
    expect(run).toMatchObject({ state: "failed", failureCode: "context_unavailable" });
    expect(JSON.stringify(model.doGenerateCalls)).not.toContain("must-not-reach-model");
    expect(run.job).toBeUndefined();
  });

  it("accepts at most one proposal when a model returns parallel duplicate or changed tool calls", async () => {
    let step = 0;
    const model = new MockLanguageModelV3({ doGenerate: async () => {
      if (++step === 1) return call("read_chart_context", {});
      const first = call("propose_follow_up", proposal);
      return { ...first, content: [
        ...first.content,
        ...call("propose_follow_up", proposal).content,
        ...call("propose_follow_up", { ...proposal, description: "A changed second proposal." }).content,
      ] };
    } });
    const f = setup(model);
    const run = await settled(f.runtime, (await f.runtime.start(prompt, "parallel-calls")).id);
    expect(run.state).toBe("awaiting_review");
    expect(run.job!.input.description).toBe(proposal.description);
    expect(await f.service.list(reviewer)).toHaveLength(1);
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(f.committer.conditionalCreate).not.toHaveBeenCalled();
  });

  it("aborts a slow context read without allowing its late resolution to submit a proposal", async () => {
    const f = setup();
    let resolveContext!: (value: WorkAssistantContext) => void;
    f.readContext.mockImplementation(() => new Promise((resolve) => { resolveContext = resolve; }));
    const initial = await f.runtime.start(prompt, "cancel-read");
    await vi.waitFor(() => expect(f.readContext).toHaveBeenCalledTimes(1));
    expect((await f.runtime.cancel(initial.id)).state).toBe("cancelled");
    resolveContext(context);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await f.runtime.get(initial.id)).state).toBe("cancelled");
    expect(await f.service.list(reviewer)).toHaveLength(0);
  });

  it("times out a nonresponsive provider and keeps provider diagnostics out of the public run", async () => {
    const f = setup(new MockLanguageModelV3({ doGenerate: () => new Promise(() => {}) }), 20);
    const run = await settled(f.runtime, (await f.runtime.start(prompt, "timeout")).id);
    expect(run).toMatchObject({ state: "failed", failureCode: "generation_timeout" });
    expect(run.job).toBeUndefined();
    const failed = setup(new MockLanguageModelV3({ doGenerate: async () => { throw new Error("api-key=private-test-value"); } }));
    const result = await settled(failed.runtime, (await failed.runtime.start(prompt, "provider-failed")).id);
    expect(result).toMatchObject({ state: "failed", failureCode: "model_failed" });
    expect(JSON.stringify(result)).not.toContain("private-test-value");
  });

  it("does not accept model final text as evidence of a save", async () => {
    const f = setup(new MockLanguageModelV3({ doGenerate: async () => ({ content: [{ type: "text", text: "I saved everything and called the patient." }], finishReason: { unified: "stop", raw: "test" }, usage, warnings: [] }) }));
    const run = await settled(f.runtime, (await f.runtime.start(prompt, "fake-success")).id);
    expect(run).toMatchObject({ state: "failed", failureCode: "proposal_missing" });
    expect(JSON.stringify(run)).not.toContain("saved everything");
    expect(f.committer.conditionalCreate).not.toHaveBeenCalled();
  });

  it("idempotently returns the same run and rejects changed requests and concurrent generation", async () => {
    const f = setup(new MockLanguageModelV3({ doGenerate: () => new Promise(() => {}) }));
    const run = await f.runtime.start(prompt, "same-key");
    expect((await f.runtime.start(prompt, "same-key")).id).toBe(run.id);
    await expect(f.runtime.start("Changed", "same-key")).rejects.toMatchObject({ code: "conflict" });
    await expect(f.runtime.start(prompt, "another-key")).rejects.toMatchObject({ code: "conflict" });
    await expect(f.runtime.start("", "invalid")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(f.runtime.start(prompt, "bad key")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(f.runtime.start("x".repeat(4001), "oversized")).rejects.toMatchObject({ code: "invalid_input" });
    const cancelled = await f.runtime.cancel(run.id);
    expect(cancelled.state).toBe("cancelled");
    await f.runtime.close();
  });

  it("cancels pending proposals through the same durable service", async () => {
    const f = setup();
    const pending = await settled(f.runtime, (await f.runtime.start(prompt, "cancel-pending")).id);
    const cancelled = await f.runtime.cancel(pending.id);
    expect(cancelled).toMatchObject({ state: "cancelled", job: { state: "cancelled" } });
    expect(f.committer.conditionalCreate).not.toHaveBeenCalled();
  });

  it("keeps a pending proposal and verified result across worker restarts without another model call", async () => {
    const model = createWorkScriptedModel();
    const f = setup(model);
    const pending = await settled(f.runtime, (await f.runtime.start(prompt, "restart")).id);
    const calls = model.doGenerateCalls.length;
    await f.runtime.close();
    const restarted = f.open();
    expect((await restarted.start(prompt, "restart")).job?.id).toBe(pending.job!.id);
    await f.service.decide(reviewer, pending.job!.id, { decision: "approve", proposalHash: pending.job!.proposalHash });
    expect((await restarted.get(pending.id)).state).toBe("succeeded");
    await restarted.close();
    expect((await f.open().get(pending.id)).job?.receipt?.id).toBe("verified-task");
    expect(model.doGenerateCalls).toHaveLength(calls);
    expect(f.committer.conditionalCreate).toHaveBeenCalledTimes(1);
  });

  it("recovers a proposal whose submission response was lost, including after restart before the link persisted", async () => {
    const f = setup();
    const originalSubmit = f.service.submit.bind(f.service);
    let loseOnce = true;
    vi.spyOn(f.service, "submit").mockImplementation(async (...args) => {
      const job = await originalSubmit(...args);
      if (loseOnce) { loseOnce = false; throw new Error("lost response"); }
      return job;
    });
    const pending = await settled(f.runtime, (await f.runtime.start(prompt, "lost-response")).id);
    expect(pending.state).toBe("awaiting_review");
    expect(await f.service.list(reviewer)).toHaveLength(1);
    await f.runtime.close();
    // Simulate a process loss after the service durable insert and before the
    // runtime link. The exact prepared input remains durably available.
    const db = new DatabaseSync(f.storePath);
    db.prepare("UPDATE assistant_runs SET job_id = NULL, state = 'generating' WHERE id = ?").run(pending.id);
    db.close();
    const recovered = await f.open().get(pending.id);
    expect(recovered).toMatchObject({ state: "awaiting_review", job: { id: pending.job!.id } });
    expect(await f.service.list(reviewer)).toHaveLength(1);
    expect(f.committer.conditionalCreate).not.toHaveBeenCalled();
  });

  it("persists interrupted generation and isolates histories by requester identity", async () => {
    const f = setup(new MockLanguageModelV3({ doGenerate: () => new Promise(() => {}) }));
    const run = await f.runtime.start(prompt, "interrupted");
    await f.runtime.close();
    const restarted = f.open();
    expect((await restarted.get(run.id))).toMatchObject({ state: "interrupted", failureCode: "generation_interrupted" });
    const other = f.open({ ...assistant, subject: "other-assistant" });
    await expect(other.get(run.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await other.list()).toEqual([]);
  });
});
