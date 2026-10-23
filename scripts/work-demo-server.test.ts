import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DurableWorkService, type FollowUpTask, type WorkJob, type WorkTaskRecord } from "../lib/work/service";
import { createWorkLabServer, LAB_REVIEWER, validateLabKeys } from "./work-demo-server";

const assistantKey = "assistant-test-credential-0000000000000000";
const reviewerKey = "reviewer-test-credential-00000000000000000";
const fixture = { patientId: "synthetic-patient", source: { reference: "Observation/synthetic-result", versionId: "1" }, patientLabel: "Invented patient", resultLabel: "Invented result" };
const input = { patientId: fixture.patientId, source: fixture.source, description: "Review this invented result.", dueDate: "2026-11-01" };

describe("synthetic work HTTP role boundary", () => {
  let directory: string;
  let service: DurableWorkService;
  let server: ReturnType<typeof createWorkLabServer>;
  let origin: string;
  let writes: number;
  let saved: Map<string, WorkTaskRecord>;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "last-work-http-"));
    saved = new Map();
    writes = 0;
    service = new DurableWorkService({
      storePath: join(directory, "work.sqlite"), reviewer: LAB_REVIEWER,
      committer: {
        validateContext: async () => true,
        findByJobId: async ({ jobId }) => saved.has(jobId) ? [saved.get(jobId)!] : [],
        conditionalCreate: async ({ jobId, proposal }) => {
          writes++;
          const id = `task-${writes}`;
          const record = { id, versionId: "1", resource: { ...structuredClone(proposal), id, meta: { versionId: "1" } } };
          saved.set(jobId, record);
          return record;
        },
      },
    });
    server = createWorkLabServer({ service, fixture, assistantKey, reviewerKey });
    await new Promise<void>((accept) => server.listen(0, "127.0.0.1", accept));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await new Promise<void>((accept, reject) => { server.close((error) => error ? reject(error) : accept()); server.closeAllConnections(); });
    service.close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function submit(key = "draft-1", body: unknown = input) {
    return fetch(`${origin}/api/work`, { method: "POST", headers: { authorization: `Bearer ${assistantKey}`, "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) });
  }
  async function login(key = reviewerKey) {
    return fetch(`${origin}/api/reviewer/session`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ key }) });
  }
  async function decision(job: WorkJob, cookie: string, body: unknown = { decision: "approve", proposalHash: job.proposalHash }) {
    return fetch(`${origin}/api/reviewer/work/${job.id}/decision`, { method: "POST", headers: { origin, cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  it("requires assistant credentials, a fixture-bound draft and an idempotency key", async () => {
    expect((await fetch(`${origin}/api/fixture`)).status).toBe(401);
    expect((await submit("draft", { ...input, patientId: "other-patient" })).status).toBe(400);
    expect((await submit("draft", { ...input, source: { ...input.source, versionId: "2" } })).status).toBe(400);
    expect((await submit("draft", { ...input, approve: true })).status).toBe(400);
    const missing = await fetch(`${origin}/api/work`, { method: "POST", headers: { authorization: `Bearer ${assistantKey}`, "content-type": "application/json" }, body: JSON.stringify(input) });
    expect(missing.status).toBe(400);
    expect(writes).toBe(0);
  });

  it("an assistant cannot establish a reviewer session or approve through a bearer token", async () => {
    expect((await login(assistantKey)).status).toBe(401);
    const { job } = await (await submit()).json() as { job: WorkJob };
    const response = await fetch(`${origin}/api/reviewer/work/${job.id}/decision`, { method: "POST", headers: { authorization: `Bearer ${assistantKey}`, origin, "content-type": "application/json" }, body: JSON.stringify({ decision: "approve", proposalHash: job.proposalHash }) });
    expect(response.status).toBe(401);
    expect(writes).toBe(0);
    const wrongRole = await fetch(`${origin}/api/fixture`, { headers: { authorization: `Bearer ${reviewerKey}` } });
    expect(wrongRole.status).toBe(401);
  });

  it("binds the decision to the exact proposal and verifies one persisted Task", async () => {
    const { job } = await (await submit()).json() as { job: WorkJob };
    const duplicate = await (await submit()).json() as { job: WorkJob };
    expect(duplicate.job.id).toBe(job.id);
    expect((await submit("draft-1", { ...input, description: "Different draft" })).status).toBe(409);
    const signedIn = await login();
    const cookie = signedIn.headers.get("set-cookie")!.split(";")[0];
    expect(signedIn.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
    expect((await decision(job, cookie, { decision: "approve", proposalHash: "0".repeat(64) })).status).toBe(409);
    expect(writes).toBe(0);
    const approved = await decision(job, cookie);
    expect(approved.status).toBe(200);
    const result = await approved.json() as { job: WorkJob };
    expect(result.job.state).toBe("succeeded");
    expect(result.job.receipt?.id).toBe("task-1");
    expect((saved.get(job.id)!.resource as FollowUpTask).restriction?.period.end).toBe(input.dueDate);
    expect((await decision(job, cookie)).status).toBe(200);
    expect(writes).toBe(1);
  });

  it("decline and cancellation record no Task and cannot be reversed by a later approval", async () => {
    const cookie = (await login()).headers.get("set-cookie")!.split(";")[0];
    const { job } = await (await submit()).json() as { job: WorkJob };
    const denied = await decision(job, cookie, { decision: "deny", proposalHash: job.proposalHash });
    expect((await denied.json()).job.state).toBe("denied");
    expect((await decision(job, cookie)).status).toBe(409);
    const second = (await (await submit("draft-2")).json()).job as WorkJob;
    const cancelled = await fetch(`${origin}/api/work/${second.id}/cancel`, { method: "POST", headers: { authorization: `Bearer ${assistantKey}` } });
    expect((await cancelled.json()).job.state).toBe("cancelled");
    expect((await decision(second, cookie)).status).toBe(409);
    expect(writes).toBe(0);
  });

  it("rejects cross-origin and forged Host requests and requires Origin for reviewer mutations", async () => {
    expect((await fetch(`${origin}/health`, { headers: { origin: "https://attacker.invalid" } })).status).toBe(403);
    const forgedHostStatus = await new Promise<number>((accept, reject) => {
      const req = httpRequest(`${origin}/health`, { headers: { host: "attacker.invalid" } }, (response) => { response.resume(); accept(response.statusCode!); });
      req.on("error", reject); req.end();
    });
    expect(forgedHostStatus).toBe(400);
    const { job } = await (await submit()).json() as { job: WorkJob };
    const cookie = (await login()).headers.get("set-cookie")!.split(";")[0];
    const response = await fetch(`${origin}/api/reviewer/work/${job.id}/decision`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ decision: "approve", proposalHash: job.proposalHash }) });
    expect(response.status).toBe(403);
    expect(writes).toBe(0);
  });

  it("bounds input size and serves isolated static assets without embedding submitted content", async () => {
    const large = await submit("large", { ...input, description: "x".repeat(13_000) });
    expect(large.status).toBe(413);
    const page = await fetch(origin);
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(await page.text()).not.toContain(assistantKey);
    const asset = await fetch(`${origin}/app.js`);
    const script = await asset.text();
    expect(script).toContain("textContent");
    expect(script).not.toContain("innerHTML");
  });
});

it("rejects shared or short role keys", () => {
  expect(() => validateLabKeys("short", reviewerKey)).toThrow();
  expect(() => validateLabKeys(assistantKey, assistantKey)).toThrow();
});
