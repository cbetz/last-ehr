import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { FollowUpTask } from "../lib/work/service";
import {
  createWorkDemoFhirAdapter,
  WORK_DEMO_FHIR_URL,
  WORK_DEMO_JOB_SYSTEM,
  WORK_DEMO_TENANT_ID,
  type WorkDemoFixture,
} from "./work-demo-fhir";

const runHapiE2E = process.env.RUN_HAPI_E2E === "1";

function proposal(fixture: WorkDemoFixture, jobId: string): FollowUpTask {
  return {
    resourceType: "Task",
    status: "requested",
    intent: "order",
    identifier: [{ system: WORK_DEMO_JOB_SYSTEM, value: jobId }],
    for: { reference: `Patient/${fixture.patientId}` },
    focus: { reference: fixture.source.reference },
    input: [{ type: { text: "Reviewed source version" }, valueString: `${fixture.source.reference}/_history/${fixture.source.versionId}` }],
    description: "Synthetic integration proof: review the invented result and arrange follow-up.",
    restriction: { period: { end: "2026-11-01" } },
  };
}

async function independentTaskRead(jobId: string) {
  const query = new URLSearchParams({ identifier: `${WORK_DEMO_JOB_SYSTEM}|${jobId}`, _count: "2", _total: "accurate" });
  const response = await fetch(`${WORK_DEMO_FHIR_URL}/Task?${query}`, {
    headers: { Accept: "application/fhir+json" },
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  expect(response.ok).toBe(true);
  return await response.json() as { total: number; entry?: Array<{ resource: Record<string, unknown> }> };
}

describe.skipIf(!runHapiE2E)("synthetic work adapter against local HAPI", () => {
  it("reads bounded assistant context matching independent authoritative FHIR reads", async () => {
    const adapter = createWorkDemoFhirAdapter();
    const fixture = await adapter.getFixture();
    const context = await adapter.readContext();
    const read = async (reference: string) => {
      const response = await fetch(`${WORK_DEMO_FHIR_URL}/${reference}`, {
        headers: { Accept: "application/fhir+json" },
        credentials: "omit", redirect: "error", signal: AbortSignal.timeout(5_000),
      });
      expect(response.ok).toBe(true);
      return await response.json();
    };
    const [patient, observation] = await Promise.all([
      read(`Patient/${fixture.patientId}`), read(fixture.source.reference),
    ]);
    expect(context).toEqual({
      patient: {
        reference: `Patient/${patient.id}`,
        label: [...patient.name[0].given, patient.name[0].family].join(" "),
        dateOfBirth: patient.birthDate,
      },
      observation: {
        reference: `Observation/${observation.id}`,
        versionId: observation.meta.versionId,
        label: observation.code.text,
        value: observation.valueQuantity.value,
        unit: observation.valueQuantity.unit,
        effectiveDateTime: observation.effectiveDateTime,
      },
    });
  }, 30_000);

  it("seeds an exact invented context and conditionally creates one verified Task across repeated requests", async () => {
    const adapter = createWorkDemoFhirAdapter();
    const fixture = await adapter.getFixture();
    expect(await adapter.getFixture()).toEqual(fixture);
    expect(await adapter.validateContext({ tenantId: WORK_DEMO_TENANT_ID, patientId: fixture.patientId, source: fixture.source })).toBe(true);
    const jobId = randomUUID();
    const task = proposal(fixture, jobId);
    const input = { tenantId: WORK_DEMO_TENANT_ID, jobId, proposal: task };
    expect(await independentTaskRead(jobId)).toMatchObject({ total: 0 });
    const created = await adapter.conditionalCreate(input);
    expect(await adapter.conditionalCreate(input)).toEqual(created);
    expect(await adapter.findByJobId(input)).toEqual([created]);
    const persisted = await independentTaskRead(jobId);
    expect(persisted.total).toBe(1);
    const stored = persisted.entry![0].resource;
    const { id, meta, ...reviewedFields } = stored;
    expect(id).toBe(created.id);
    expect(meta).toBeTruthy();
    expect(reviewedFields).toEqual(task);
  }, 30_000);

  it("rejects stale source proposals and leaves no Task behind", async () => {
    const adapter = createWorkDemoFhirAdapter();
    const fixture = await adapter.getFixture();
    const jobId = randomUUID();
    const staleFixture = { ...fixture, source: { ...fixture.source, versionId: `${fixture.source.versionId}-stale` } };
    expect(await adapter.validateContext({ tenantId: WORK_DEMO_TENANT_ID, patientId: fixture.patientId, source: staleFixture.source })).toBe(false);
    await expect(adapter.conditionalCreate({ tenantId: WORK_DEMO_TENANT_ID, jobId, proposal: proposal(staleFixture, jobId) })).rejects.toMatchObject({ code: "FHIR_TASK_INVALID" });
    expect(await independentTaskRead(jobId)).toMatchObject({ total: 0 });
  }, 30_000);

  it("reconciles a real persisted write after its HTTP response is lost", async () => {
    const realFetch = globalThis.fetch;
    let loseFirstTaskResponse = true;
    const adapter = createWorkDemoFhirAdapter({
      fetch: async (input, init) => {
        const response = await realFetch(input, init);
        if (loseFirstTaskResponse && String(input).endsWith("/Task") && init?.method === "POST") {
          loseFirstTaskResponse = false;
          await response.arrayBuffer();
          throw new Error("Simulated connection loss after HAPI persisted the synthetic Task.");
        }
        return response;
      },
    });
    const fixture = await adapter.getFixture();
    const jobId = randomUUID();
    const input = { tenantId: WORK_DEMO_TENANT_ID, jobId, proposal: proposal(fixture, jobId) };
    await expect(adapter.conditionalCreate(input)).rejects.toMatchObject({ code: "FHIR_COMMIT_UNKNOWN" });
    const reconciled = await adapter.findByJobId(input);
    expect(reconciled).toHaveLength(1);
    expect(await adapter.conditionalCreate(input)).toEqual(reconciled[0]);
    const persisted = await independentTaskRead(jobId);
    expect(persisted.total).toBe(1);
    expect(persisted.entry![0].resource).toMatchObject(input.proposal);
  }, 30_000);
});
