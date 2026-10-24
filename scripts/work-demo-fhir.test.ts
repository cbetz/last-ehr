import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { FollowUpTask } from "../lib/work/service";
import {
  createWorkDemoFhirAdapter,
  validateWorkDemoFhirUrl,
  WORK_DEMO_JOB_SYSTEM,
  WORK_DEMO_TENANT_ID,
  type WorkDemoFixture,
} from "./work-demo-fhir";

type Resource = Record<string, unknown>;

function fakeHapi() {
  const resources: Resource[] = [];
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const conditional = { Patient: true, Observation: true, Task: true };
  let lostTaskResponse = false;
  let nextId = 0;
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const path = url.pathname.split("/").slice(2);
    const type = path[0];
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/fhir+json" } });
    if (type === "metadata") {
      return json({
        resourceType: "CapabilityStatement",
        rest: [{ mode: "server", resource: Object.entries(conditional).map(([type, conditionalCreate]) => ({ type, conditionalCreate })) }],
      });
    }
    if (path.length === 2 && !init.method) {
      const resource = resources.find((entry) => entry.resourceType === type && entry.id === path[1]);
      return resource ? json(resource) : new Response(null, { status: 404 });
    }
    const matches = (criterion: string) => {
      const [system, value] = criterion.split("|");
      return resources.filter((resource) => resource.resourceType === type && Array.isArray(resource.identifier) && resource.identifier.some((identifier) => identifier.system === system && identifier.value === value));
    };
    if (init.method === "POST") {
      const criterion = new URLSearchParams(new Headers(init.headers).get("If-None-Exist") ?? "").get("identifier");
      if (!criterion) throw new Error("Conditional create header required");
      const existing = matches(criterion);
      if (existing.length > 1) return new Response(null, { status: 412 });
      let result = existing[0];
      if (!result) {
        result = { ...JSON.parse(String(init.body)), id: `work-lab-${++nextId}`, meta: { versionId: "1" } };
        resources.push(result);
      }
      if (type === "Task" && lostTaskResponse) throw new Error("PRIVATE PATIENT DATA FROM UPSTREAM");
      return json(result);
    }
    const found = matches(url.searchParams.get("identifier") ?? "");
    return json({ resourceType: "Bundle", type: "searchset", total: found.length, entry: found.map((resource) => ({ resource })) });
  };
  return { resources, calls, conditional, fetcher, loseTaskResponses: () => { lostTaskResponse = true; }, restoreTaskResponses: () => { lostTaskResponse = false; } };
}

function proposal(fixture: WorkDemoFixture, jobId: string): FollowUpTask {
  return {
    resourceType: "Task",
    status: "requested",
    intent: "order",
    identifier: [{ system: WORK_DEMO_JOB_SYSTEM, value: jobId }],
    for: { reference: `Patient/${fixture.patientId}` },
    focus: { reference: fixture.source.reference },
    input: [{ type: { text: "Reviewed source version" }, valueString: `${fixture.source.reference}/_history/${fixture.source.versionId}` }],
    description: "Review the invented result and arrange the requested follow-up.",
    restriction: { period: { end: "2026-11-01" } },
  };
}

describe("synthetic work FHIR adapter boundary", () => {
  it.each([
    "https://127.0.0.1/fhir", "http://localhost:8080/fhir", "http://example.com/fhir",
    "http://127.0.0.2/fhir", "http://2130706433/fhir", "http://0x7f000001/fhir",
    "http://127.1/fhir", "http://0177.0.0.1/fhir", "http://127.0.0.1/fhir/../fhir",
    "http://user:secret@127.0.0.1/fhir", "http://127.0.0.1/fhir?token=secret",
    "http://127.0.0.1/fhir#private", "http://[::ffff:127.0.0.1]/fhir",
    "http://127.0.0.1:8080/real-patient-fhir", "http://127.0.0.1:99999/fhir",
  ])("rejects an unsafe backend spelling before network access: %s", (url) => {
    expect(() => createWorkDemoFhirAdapter({ baseUrl: url })).toThrow(/numeric loopback/);
  });

  it("accepts only explicit numeric loopback origins and normalizes a trailing slash", () => {
    expect(validateWorkDemoFhirUrl("http://127.0.0.1:8080/fhir/")).toBe("http://127.0.0.1:8080/fhir");
    expect(validateWorkDemoFhirUrl("http://[::1]:8080/fhir")).toBe("http://[::1]:8080/fhir");
  });

  it("conditionally creates only invented fixtures, reuses them and disables redirects and credentials", async () => {
    const hapi = fakeHapi();
    const adapter = createWorkDemoFhirAdapter({ fetch: hapi.fetcher });
    const fixture = await adapter.getFixture();
    expect(await adapter.getFixture()).toEqual(fixture);
    expect(hapi.resources.map((resource) => resource.resourceType)).toEqual(["Patient", "Observation"]);
    expect(hapi.calls.filter(({ init }) => init.method === "POST")).toHaveLength(2);
    for (const { init } of hapi.calls) {
      expect(init.redirect).toBe("error");
      expect(init.credentials).toBe("omit");
      expect(new Headers(init.headers).has("Authorization")).toBe(false);
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect([undefined, "POST"]).toContain(init.method);
    }
  });

  it.each(["Patient", "Observation", "Task"] as const)("requires an explicit %s conditional-create capability before seeding", async (type) => {
    const hapi = fakeHapi();
    hapi.conditional[type] = false;
    await expect(createWorkDemoFhirAdapter({ fetch: hapi.fetcher }).getFixture()).rejects.toMatchObject({ code: "FHIR_CAPABILITY_REQUIRED" });
    expect(hapi.resources).toEqual([]);
  });

  it("never overwrites an unrelated chart carrying the lab marker", async () => {
    const hapi = fakeHapi();
    const adapter = createWorkDemoFhirAdapter({ fetch: hapi.fetcher });
    await adapter.getFixture();
    hapi.resources[0].birthDate = "1985-01-01";
    await expect(adapter.getFixture()).rejects.toMatchObject({ code: "FHIR_FIXTURE_MISMATCH" });
    expect(hapi.resources[0].birthDate).toBe("1985-01-01");
    expect(hapi.calls.filter(({ init }) => init.method === "POST")).toHaveLength(2);
  });

  it("checks source version, fixed patient scope and synthetic contents freshly", async () => {
    const hapi = fakeHapi();
    const adapter = createWorkDemoFhirAdapter({ fetch: hapi.fetcher });
    const fixture = await adapter.getFixture();
    const context = { tenantId: WORK_DEMO_TENANT_ID, patientId: fixture.patientId, source: fixture.source };
    expect(await adapter.validateContext(context)).toBe(true);
    expect(await adapter.validateContext({ ...context, patientId: "unrelated" })).toBe(false);
    expect(await adapter.validateContext({ ...context, source: { ...fixture.source, versionId: "2" } })).toBe(false);
    await expect(adapter.validateContext({ ...context, tenantId: "other-tenant" })).rejects.toMatchObject({ code: "FHIR_SCOPE_INVALID" });
    hapi.resources[1].meta = { versionId: "2" };
    expect(await adapter.validateContext(context)).toBe(false);
    hapi.resources[1].valueQuantity = { value: 99, unit: "%" };
    await expect(adapter.validateContext(context)).rejects.toMatchObject({ code: "FHIR_FIXTURE_MISMATCH" });
  });

  it("projects only approved model context from fresh authoritative fixture reads", async () => {
    const hapi = fakeHapi();
    const seed = createWorkDemoFhirAdapter({ fetch: hapi.fetcher });
    const fixture = await seed.getFixture();
    hapi.resources[0].meta = { versionId: "1", security: [{ code: "PRIVATE METADATA" }] };
    hapi.resources[1].meta = { versionId: "2", source: "PRIVATE METADATA" };
    const adapter = createWorkDemoFhirAdapter({ fetch: async (input, init) => {
      const response = await hapi.fetcher(input, init);
      const url = new URL(String(input));
      if (url.pathname.endsWith("/Observation") && url.search) {
        const bundle = await response.json();
        for (const entry of bundle.entry) entry.resource.meta.versionId = "1";
        return new Response(JSON.stringify(bundle));
      }
      return response;
    } });
    const before = hapi.calls.length;
    expect(await adapter.readContext()).toEqual({
      patient: {
        reference: `Patient/${fixture.patientId}`,
        label: "Alex Synthetic Worklab",
        dateOfBirth: "2000-01-01",
      },
      observation: {
        reference: fixture.source.reference,
        versionId: "2",
        label: "Demonstration HbA1c result (synthetic)",
        value: 6.4,
        unit: "%",
        effectiveDateTime: "2026-01-01T12:00:00Z",
      },
    });
    expect(hapi.calls.slice(before).map(({ url }) => url.pathname)).toEqual([
      "/fhir/Patient", `/fhir/Patient/${fixture.patientId}`,
      "/fhir/Observation", `/fhir/${fixture.source.reference}`,
    ]);
    expect(hapi.calls.slice(before).every(({ init }) => !init.method)).toBe(true);
  });

  it.each(["Patient", "Observation"])("rejects %s drift on direct read before disclosing model context", async (type) => {
    const hapi = fakeHapi();
    await createWorkDemoFhirAdapter({ fetch: hapi.fetcher }).getFixture();
    const adapter = createWorkDemoFhirAdapter({ fetch: async (input, init) => {
      const response = await hapi.fetcher(input, init);
      const url = new URL(String(input));
      if (!url.search && url.pathname.startsWith(`/fhir/${type}/`)) {
        const resource = await response.json();
        if (type === "Patient") resource.birthDate = "1985-01-01";
        else resource.valueQuantity.value = 99;
        return new Response(JSON.stringify(resource));
      }
      return response;
    } });
    await expect(adapter.readContext()).rejects.toMatchObject({ code: "FHIR_FIXTURE_MISMATCH" });
    expect(hapi.calls.filter(({ init }) => init.method === "POST")).toHaveLength(2);
  });

  it("uses a fresh direct read when the search index still reports the pinned version", async () => {
    const hapi = fakeHapi();
    const initial = createWorkDemoFhirAdapter({ fetch: hapi.fetcher });
    const fixture = await initial.getFixture();
    hapi.resources[1].meta = { versionId: "2" };
    const adapter = createWorkDemoFhirAdapter({ fetch: async (input, init) => {
      const response = await hapi.fetcher(input, init);
      const url = new URL(String(input));
      if (url.pathname.endsWith("/Observation") && url.search) {
        const bundle = await response.json();
        for (const entry of bundle.entry) entry.resource.meta.versionId = "1";
        return new Response(JSON.stringify(bundle));
      }
      return response;
    } });
    expect(await adapter.validateContext({ tenantId: WORK_DEMO_TENANT_ID, patientId: fixture.patientId, source: fixture.source })).toBe(false);
  });

  it("conditionally creates one exact Task and reconciles repeated requests without duplication", async () => {
    const hapi = fakeHapi();
    const adapter = createWorkDemoFhirAdapter({ fetch: hapi.fetcher });
    const fixture = await adapter.getFixture();
    const jobId = randomUUID();
    const input = { tenantId: WORK_DEMO_TENANT_ID, jobId, proposal: proposal(fixture, jobId) };
    expect(await adapter.findByJobId(input)).toEqual([]);
    const created = await adapter.conditionalCreate(input);
    expect(await adapter.conditionalCreate(input)).toEqual(created);
    expect(await adapter.findByJobId(input)).toEqual([created]);
    expect(hapi.resources.filter((resource) => resource.resourceType === "Task")).toHaveLength(1);
    const taskCall = hapi.calls.find(({ url, init }) => url.pathname.endsWith("/Task") && init.method === "POST")!;
    expect(new URLSearchParams(new Headers(taskCall.init.headers).get("If-None-Exist")!).get("identifier")).toBe(`${WORK_DEMO_JOB_SYSTEM}|${jobId}`);
    expect(created.resource).toMatchObject(input.proposal);
  });

  it("fails closed if the current source changed or a caller adds unreviewed Task fields", async () => {
    const hapi = fakeHapi();
    const adapter = createWorkDemoFhirAdapter({ fetch: hapi.fetcher });
    const fixture = await adapter.getFixture();
    const jobId = randomUUID();
    const input = { tenantId: WORK_DEMO_TENANT_ID, jobId, proposal: proposal(fixture, jobId) };
    await expect(adapter.conditionalCreate({ ...input, proposal: { ...input.proposal, owner: { reference: "Practitioner/unreviewed" } } as FollowUpTask })).rejects.toMatchObject({ code: "FHIR_TASK_INVALID" });
    hapi.resources[1].meta = { versionId: "2" };
    await expect(adapter.conditionalCreate(input)).rejects.toMatchObject({ code: "FHIR_TASK_INVALID" });
    expect(hapi.resources.filter((resource) => resource.resourceType === "Task")).toEqual([]);
  });

  it("rechecks conditional-create capability immediately before the Task write", async () => {
    const hapi = fakeHapi();
    const adapter = createWorkDemoFhirAdapter({ fetch: hapi.fetcher });
    const fixture = await adapter.getFixture();
    hapi.conditional.Task = false;
    const jobId = randomUUID();
    await expect(adapter.conditionalCreate({ tenantId: WORK_DEMO_TENANT_ID, jobId, proposal: proposal(fixture, jobId) })).rejects.toMatchObject({ code: "FHIR_CAPABILITY_REQUIRED" });
    expect(hapi.resources.filter((resource) => resource.resourceType === "Task")).toEqual([]);
  });

  it("preserves an uncertain write for reconciliation and never exposes upstream error text", async () => {
    const hapi = fakeHapi();
    const adapter = createWorkDemoFhirAdapter({ fetch: hapi.fetcher });
    const fixture = await adapter.getFixture();
    const jobId = randomUUID();
    const input = { tenantId: WORK_DEMO_TENANT_ID, jobId, proposal: proposal(fixture, jobId) };
    hapi.loseTaskResponses();
    await expect(adapter.conditionalCreate(input)).rejects.toMatchObject({ code: "FHIR_COMMIT_UNKNOWN", message: "The FHIR write outcome is unknown; reconcile before retrying." });
    expect(await adapter.findByJobId(input)).toHaveLength(1);
    hapi.restoreTaskResponses();
    await adapter.conditionalCreate(input);
    expect(hapi.resources.filter((resource) => resource.resourceType === "Task")).toHaveLength(1);
  });

  it("reports duplicate matches and rejects a mismatching prior Task without changing it", async () => {
    const hapi = fakeHapi();
    const adapter = createWorkDemoFhirAdapter({ fetch: hapi.fetcher });
    const fixture = await adapter.getFixture();
    const jobId = randomUUID();
    const input = { tenantId: WORK_DEMO_TENANT_ID, jobId, proposal: proposal(fixture, jobId) };
    await adapter.conditionalCreate(input);
    const task = hapi.resources.find((resource) => resource.resourceType === "Task")!;
    task.description = "Different earlier content";
    await expect(adapter.conditionalCreate(input)).rejects.toMatchObject({ code: "FHIR_COMMIT_UNKNOWN" });
    expect(task.description).toBe("Different earlier content");
    hapi.resources.push({ ...task, id: "duplicate-task" });
    expect(await adapter.findByJobId(input)).toHaveLength(2);
  });

  it("does not expose invalid upstream response bodies", async () => {
    const adapter = createWorkDemoFhirAdapter({ fetch: async () => new Response("PRIVATE UPSTREAM RESPONSE", { status: 500 }) });
    await expect(adapter.getFixture()).rejects.toMatchObject({ code: "FHIR_UNAVAILABLE", message: "The local synthetic FHIR service is unavailable." });
  });
});
