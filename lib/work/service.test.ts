import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DurableWorkService,
  type FollowUpInput,
  type FollowUpTask,
  matchesProposal,
  type WorkActor,
  type WorkCommitter,
  type WorkTaskRecord,
} from "./service";

const assistant: WorkActor = { tenantId: "synthetic-lab", subject: "assistant-lab", role: "assistant" };
const reviewer: WorkActor = { tenantId: "synthetic-lab", subject: "reviewer-lab", role: "reviewer" };
const input: FollowUpInput = {
  patientId: "invented-patient", source: { reference: "Observation/invented-result", versionId: "1" },
  description: "Contact the synthetic patient to arrange a follow-up visit.", dueDate: "2026-11-01",
};

const directories: string[] = [];
const services: DurableWorkService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) { try { service.close(); } catch { /* already closed by restart tests */ } }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function setup() {
  const directory = mkdtempSync(join(tmpdir(), "last-work-test-"));
  directories.push(directory);
  const storePath = join(directory, "private", "jobs.sqlite");
  const resources = new Map<string, WorkTaskRecord[]>();
  const committer = {
    validateContext: vi.fn<WorkCommitter["validateContext"]>(async () => true),
    findByJobId: vi.fn<WorkCommitter["findByJobId"]>(async ({ jobId }) => structuredClone(resources.get(jobId) ?? [])),
    conditionalCreate: vi.fn<WorkCommitter["conditionalCreate"]>(async ({ jobId, proposal }) => {
      const existing = resources.get(jobId);
      if (existing?.length === 1) return structuredClone(existing[0]);
      const record = recordFor(proposal);
      resources.set(jobId, [record]);
      return structuredClone(record);
    }),
  };
  let time = Date.parse("2026-10-23T16:00:00Z");
  const open = () => {
    const service = new DurableWorkService({ storePath, reviewer, committer, now: () => time, ttlMs: 60_000 });
    services.push(service);
    return service;
  };
  return { directory, storePath, service: open(), open, resources, committer, advance: (ms: number) => { time += ms; } };
}

function recordFor(proposal: FollowUpTask, id = "task-created"): WorkTaskRecord {
  return { id, versionId: "1", resource: { ...structuredClone(proposal), id, meta: { versionId: "1" } } };
}

describe("durable synthetic work boundary", () => {
  it("persists the exact proposal and isolates the store on disk", async () => {
    const f = setup();
    const submitted = await f.service.submit(assistant, input, "job-1");
    expect(submitted).toMatchObject({ state: "awaiting_review", requestedBy: assistant.subject, reviewerSubject: reviewer.subject });
    expect(submitted.proposal.focus.reference).toBe("Observation/invented-result");
    expect(submitted.proposal.input).toEqual([{ type: { text: "Reviewed source version" }, valueString: "Observation/invented-result/_history/1" }]);
    expect(submitted.proposalHash).toMatch(/^[a-f0-9]{64}$/);
    f.service.close();
    expect(await f.open().get(assistant, submitted.id)).toEqual(submitted);
    expect(statSync(join(f.directory, "private")).mode & 0o777).toBe(0o700);
    expect(statSync(f.storePath).mode & 0o777).toBe(0o600);
  });

  it("rejects unsafe existing store paths without changing their permissions", () => {
    const f = setup();
    const unsafe = join(f.directory, "public");
    mkdirSync(unsafe, { mode: 0o755 });
    chmodSync(unsafe, 0o755);
    const options = { reviewer, committer: f.committer };
    expect(() => new DurableWorkService({ ...options, storePath: join(unsafe, "jobs.sqlite") })).toThrow();
    expect(statSync(unsafe).mode & 0o777).toBe(0o755);
    const file = join(f.directory, "unsafe.sqlite");
    writeFileSync(file, "not a database", { mode: 0o644 });
    chmodSync(file, 0o644);
    expect(() => new DurableWorkService({ ...options, storePath: file })).toThrow();
    expect(statSync(file).mode & 0o777).toBe(0o644);
    const link = join(f.directory, "linked.sqlite");
    symlinkSync(f.storePath, link);
    expect(() => new DurableWorkService({ ...options, storePath: link })).toThrow();
    const danglingLink = join(f.directory, "dangling.sqlite");
    symlinkSync(join(f.directory, "missing.sqlite"), danglingLink);
    expect(() => new DurableWorkService({ ...options, storePath: danglingLink })).toThrow();
  });

  it("binds a reviewer decision to the exact proposal, then independently verifies the Task", async () => {
    const f = setup();
    const submitted = await f.service.submit(assistant, input, "job-1");
    const reviewedHash = submitted.proposalHash;
    submitted.proposal.description = "A caller mutated its local copy.";
    const approved = await f.service.decide(reviewer, submitted.id, { decision: "approve", proposalHash: reviewedHash });
    expect(approved.state).toBe("succeeded");
    expect(approved.proposal.description).toBe(input.description);
    expect(approved.decision).toMatchObject({ decision: "approve", subject: reviewer.subject, proposalHash: reviewedHash });
    expect(approved.receipt).toMatchObject({ resourceType: "Task", id: "task-created", versionId: "1" });
    expect(f.committer.conditionalCreate).toHaveBeenCalledTimes(1);
    expect(f.committer.findByJobId).toHaveBeenCalledTimes(2);
    expect(await f.service.decide(reviewer, submitted.id, { decision: "approve", proposalHash: reviewedHash })).toEqual(approved);
    expect(f.committer.conditionalCreate).toHaveBeenCalledTimes(1);
  });

  it("binds the reviewed source version into the exact FHIR Task and proposal hash", async () => {
    const f = setup();
    const job = await f.service.submit(assistant, input, "version-1");
    const otherVersion = await f.service.submit(assistant, { ...input, source: { ...input.source, versionId: "2" } }, "version-2");
    expect(otherVersion.proposal.input[0].valueString).toBe("Observation/invented-result/_history/2");
    const changed = structuredClone(job.proposal);
    changed.input[0].valueString = "Observation/invented-result/_history/2";
    expect(matchesProposal(changed, job.proposal)).toBe(false);
    const withoutInput = { ...job.proposal } as Partial<FollowUpTask>;
    delete withoutInput.input;
    expect(matchesProposal(withoutInput, job.proposal)).toBe(false);
    expect(matchesProposal({ ...job.proposal, id: "server-id", meta: { versionId: "1" } }, job.proposal)).toBe(true);
    // Simulate corruption of one persisted field without changing the reviewed
    // digest. Commit must recompute the hash and stop before any FHIR access.
    const db = new DatabaseSync(f.storePath);
    db.prepare("UPDATE work_jobs SET proposal_json = ? WHERE id = ?").run(JSON.stringify(changed), job.id);
    db.close();
    expect((await f.service.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash })).state).toBe("needs_reconciliation");
    expect(f.committer.validateContext).not.toHaveBeenCalled();
    expect(f.committer.conditionalCreate).not.toHaveBeenCalled();
  });

  it("denies without consulting or writing the FHIR backend", async () => {
    const f = setup();
    const job = await f.service.submit(assistant, input, "job-1");
    expect((await f.service.decide(reviewer, job.id, { decision: "deny", proposalHash: job.proposalHash })).state).toBe("denied");
    expect(f.committer.validateContext).not.toHaveBeenCalled();
    expect(f.committer.findByJobId).not.toHaveBeenCalled();
    expect(f.committer.conditionalCreate).not.toHaveBeenCalled();
    await expect(f.service.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash })).rejects.toMatchObject({ code: "conflict" });
  });

  it("rejects role forgery, reviewer-as-requester, other owners and other tenants", async () => {
    const f = setup();
    const job = await f.service.submit(assistant, input, "job-1");
    const decision = { decision: "approve" as const, proposalHash: job.proposalHash };
    await expect(f.service.decide(assistant, job.id, decision)).rejects.toMatchObject({ code: "forbidden" });
    await expect(f.service.decide({ ...assistant, role: "reviewer" }, job.id, decision)).rejects.toMatchObject({ code: "forbidden" });
    await expect(f.service.submit({ ...reviewer, role: "assistant" }, input, "job-2")).rejects.toMatchObject({ code: "forbidden" });
    await expect(f.service.submit(reviewer, input, "job-2")).rejects.toMatchObject({ code: "forbidden" });
    await expect(f.service.get({ ...assistant, subject: "another-assistant" }, job.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(f.service.get({ ...reviewer, tenantId: "another-tenant" }, job.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(f.service.list(assistant)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects stale hashes, extra decision fields and unknown proposal fields", async () => {
    const f = setup();
    const job = await f.service.submit(assistant, input, "job-1");
    await expect(f.service.decide(reviewer, job.id, { decision: "approve", proposalHash: "a".repeat(64) })).rejects.toMatchObject({ code: "conflict" });
    await expect(f.service.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash, description: "changed" } as never)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(f.service.submit(assistant, { ...input, status: "completed" } as never, "job-2")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(f.service.submit(assistant, { ...input, patientId: "../Patient/other" }, "job-2")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(f.service.submit(assistant, { ...input, dueDate: "2026-02-30" }, "job-2")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(f.service.submit(assistant, { ...input, dueDate: "2026-02-30T12:00:00Z" }, "job-2")).rejects.toMatchObject({ code: "invalid_input" });
    expect(f.committer.conditionalCreate).not.toHaveBeenCalled();
  });

  it("expires pending proposals durably and refuses late approval", async () => {
    const f = setup();
    const job = await f.service.submit(assistant, input, "job-1");
    f.advance(60_000);
    await expect(f.service.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash })).rejects.toMatchObject({ code: "expired" });
    f.service.close();
    expect((await f.open().get(assistant, job.id)).state).toBe("expired");
    expect(f.committer.conditionalCreate).not.toHaveBeenCalled();
  });

  it("deduplicates submissions across restart and rejects key reuse for different content", async () => {
    const f = setup();
    const job = await f.service.submit(assistant, input, "job-1");
    f.service.close();
    const reopened = f.open();
    expect((await reopened.submit(assistant, input, "job-1")).id).toBe(job.id);
    await expect(reopened.submit(assistant, { ...input, description: "A different proposal" }, "job-1")).rejects.toMatchObject({ code: "conflict" });
    await expect(reopened.submit(assistant, input, "x".repeat(129))).rejects.toMatchObject({ code: "invalid_input" });
    expect(await reopened.list(reviewer)).toHaveLength(1);
  });

  it("performs one write for concurrent approvals from two store connections", async () => {
    const f = setup();
    const second = f.open();
    const job = await f.service.submit(assistant, input, "job-1");
    const results = await Promise.all([
      f.service.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash }),
      second.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash }),
    ]);
    expect(results.some((result) => result.state === "succeeded")).toBe(true);
    expect(f.committer.conditionalCreate).toHaveBeenCalledTimes(1);
    expect((await second.get(assistant, job.id)).state).toBe("succeeded");
  });

  it("cancels pending work and truthfully refuses cancellation after commit starts", async () => {
    const f = setup();
    const cancelled = await f.service.submit(assistant, input, "cancel-me");
    expect((await f.service.cancel(assistant, cancelled.id)).state).toBe("cancelled");
    await expect(f.service.decide(reviewer, cancelled.id, { decision: "approve", proposalHash: cancelled.proposalHash })).rejects.toMatchObject({ code: "conflict" });
    const job = await f.service.submit(assistant, input, "approve-me");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    f.committer.validateContext.mockImplementationOnce(async () => { await gate; return true; });
    const approving = f.service.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash });
    await vi.waitFor(() => expect(f.committer.validateContext).toHaveBeenCalled());
    await expect(f.service.cancel(assistant, job.id)).rejects.toMatchObject({ code: "conflict" });
    expect((await f.service.get(assistant, job.id)).state).toBe("committing");
    release();
    expect((await approving).state).toBe("succeeded");
    await expect(f.service.cancel(assistant, job.id)).rejects.toMatchObject({ code: "conflict" });
  });

  it("recovers a committed write after a lost response without creating again", async () => {
    const f = setup();
    f.committer.conditionalCreate.mockImplementationOnce(async ({ jobId, proposal }) => {
      f.resources.set(jobId, [recordFor(proposal)]);
      throw new Error("Network error containing an untrusted response body");
    });
    const job = await f.service.submit(assistant, input, "job-1");
    const uncertain = await f.service.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash });
    expect(uncertain.state).toBe("needs_reconciliation");
    expect(JSON.stringify(uncertain)).not.toContain("untrusted response body");
    f.service.close();
    expect((await f.open().recover())[0]).toMatchObject({ state: "succeeded", receipt: { id: "task-created" } });
    expect(f.committer.conditionalCreate).toHaveBeenCalledTimes(1);
  });

  it("keeps a missing uncertain write unresolved instead of blindly retrying", async () => {
    const f = setup();
    f.committer.conditionalCreate.mockRejectedValueOnce(new Error("Connection lost"));
    const job = await f.service.submit(assistant, input, "job-1");
    await f.service.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash });
    expect((await f.service.recover())[0].state).toBe("needs_reconciliation");
    expect((await f.service.recover())[0].state).toBe("needs_reconciliation");
    expect((await f.service.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash })).state).toBe("needs_reconciliation");
    expect(f.committer.conditionalCreate).toHaveBeenCalledTimes(1);
  });

  it("reconciles persisted committing state after restart only with a bound approval", async () => {
    const f = setup();
    const approved = await f.service.submit(assistant, input, "approved");
    const unapproved = await f.service.submit(assistant, input, "unapproved");
    f.resources.set(approved.id, [recordFor(approved.proposal)]);
    f.resources.set(unapproved.id, [recordFor(unapproved.proposal, "unapproved-task")]);
    f.service.close();
    const db = new DatabaseSync(f.storePath);
    db.prepare("UPDATE work_jobs SET state = 'committing', decision_json = ? WHERE id = ?").run(JSON.stringify({ decision: "approve", subject: reviewer.subject, at: approved.updatedAt, proposalHash: approved.proposalHash }), approved.id);
    db.prepare("UPDATE work_jobs SET state = 'committing' WHERE id = ?").run(unapproved.id);
    db.close();
    const results = await f.open().recover();
    expect(results.find((job) => job.id === approved.id)?.state).toBe("succeeded");
    expect(results.find((job) => job.id === unapproved.id)?.state).toBe("needs_reconciliation");
    expect(f.committer.findByJobId).toHaveBeenCalledTimes(1);
    expect(f.committer.conditionalCreate).not.toHaveBeenCalled();
  });

  it("does not claim success for a changed resource, wrong identity or multiple matching Tasks", async () => {
    const f = setup();
    const job = await f.service.submit(assistant, input, "job-1");
    f.committer.conditionalCreate.mockImplementationOnce(async ({ jobId, proposal }) => {
      const changed = recordFor({ ...proposal, description: "Changed after review" });
      f.resources.set(jobId, [changed]);
      return changed;
    });
    expect((await f.service.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash })).state).toBe("needs_reconciliation");
    f.resources.set(job.id, [recordFor(job.proposal), recordFor(job.proposal, "duplicate-task")]);
    expect((await f.service.recover())[0].state).toBe("needs_reconciliation");
    f.resources.set(job.id, [{ ...recordFor(job.proposal), id: "wrong-id" }]);
    expect((await f.service.recover())[0].state).toBe("needs_reconciliation");
    expect(matchesProposal({ ...job.proposal, note: [{ text: "unreviewed" }] }, job.proposal)).toBe(false);
  });

  it("recognizes an existing exact Task without another create", async () => {
    const f = setup();
    const job = await f.service.submit(assistant, input, "job-1");
    f.resources.set(job.id, [recordFor(job.proposal)]);
    expect((await f.service.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash })).state).toBe("succeeded");
    expect(f.committer.conditionalCreate).not.toHaveBeenCalled();
  });

  it("fails closed when source ownership or pinned version no longer validates", async () => {
    const f = setup();
    f.committer.validateContext.mockResolvedValueOnce(false);
    const job = await f.service.submit(assistant, input, "job-1");
    expect(await f.service.decide(reviewer, job.id, { decision: "approve", proposalHash: job.proposalHash })).toMatchObject({ state: "failed", failureCode: "source_invalid" });
    expect(f.committer.conditionalCreate).not.toHaveBeenCalled();
    expect(await f.service.recover()).toEqual([]);
  });
});
