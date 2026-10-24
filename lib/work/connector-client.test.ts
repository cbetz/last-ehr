import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { WorkAssistantContext } from "./assistant";
import { WorkConnectorClient, WorkConnectorError } from "./connector-client";
import type { WorkJob } from "./service";

const key = "assistant-connector-credential-00000000000000";
const id = "78597151-f932-4c0b-a5b3-67f06f359d63";
const context: WorkAssistantContext = {
  patient: { reference: "Patient/synthetic-patient", label: "Invented patient", dateOfBirth: "2000-01-01" },
  observation: { reference: "Observation/synthetic-result", versionId: "1", label: "Synthetic HbA1c", value: 6.4, unit: "%", effectiveDateTime: "2026-01-01T12:00:00Z" },
};
const input = { description: "Review the invented result.", dueDate: "2026-11-01", sourceReference: context.observation.reference, sourceVersionId: "1", idempotencyKey: "connector-proposal-1" };
const json = (value: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function job(): WorkJob {
  const proposal: WorkJob["proposal"] = {
    resourceType: "Task", identifier: [{ system: "https://lastehr.com/work-lab/job", value: id }], status: "requested", intent: "order",
    for: { reference: context.patient.reference }, focus: { reference: context.observation.reference },
    input: [{ type: { text: "Reviewed source version" }, valueString: `${context.observation.reference}/_history/1` }],
    description: input.description, restriction: { period: { end: input.dueDate } },
  };
  return {
    id, tenantId: "synthetic-work-lab", requestedBy: "assistant-lab", reviewerSubject: "reviewer-lab", state: "awaiting_review",
    createdAt: "2026-10-23T12:00:00.000Z", updatedAt: "2026-10-23T12:00:00.000Z", expiresAt: "2026-10-24T12:00:00.000Z",
    input: { patientId: "synthetic-patient", source: { reference: context.observation.reference, versionId: "1" }, description: input.description, dueDate: input.dueDate },
    proposal, proposalHash: createHash("sha256").update(canonical(proposal)).digest("hex"),
  };
}

describe("local Work connector transport", () => {
  it("rejects alternate hosts, URL tricks, invalid ports and header-unsafe credentials before networking", () => {
    for (const baseUrl of ["https://127.0.0.1:3300", "http://localhost:3300", "http://127.1:3300", "http://2130706433:3300", "http://0177.0.0.1:3300", "http://127.0.0.1:80", "http://127.0.0.1:03300", "http://127.0.0.1:65536", "http://127.0.0.1:3300/fhir", "http://127.0.0.1:3300?x=y", "http://127.0.0.1:3300/#fragment", "http://secret@127.0.0.1:3300", "http://[::1]:3300"]) {
      expect(() => new WorkConnectorClient({ baseUrl, assistantKey: key })).toThrow(WorkConnectorError);
    }
    for (const assistantKey of ["short", `${key}\n`, `${key} other`, `${key}\u007f`]) expect(() => new WorkConnectorClient({ assistantKey })).toThrow(WorkConnectorError);
    expect(() => new WorkConnectorClient({ assistantKey: key, timeoutMs: 0 })).toThrow(WorkConnectorError);
  });

  it("reads only the bounded context, binds its source and fixes the patient before submitting", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ context })).mockResolvedValueOnce(json({ job: job() }));
    const client = new WorkConnectorClient({ assistantKey: key, fetch: fetcher });
    await expect(client.propose(input)).rejects.toMatchObject({ code: "context_required" });
    const returned = await client.readContext();
    returned.patient.reference = "Patient/attacker";
    await expect(client.propose({ ...input, sourceVersionId: "2" })).rejects.toMatchObject({ code: "source_mismatch" });
    await expect(client.propose({ ...input, patientId: "attacker" })).rejects.toMatchObject({ code: "invalid_input" });
    const result = await client.propose(input);
    expect(result.state).toBe("awaiting_review");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, options] = fetcher.mock.calls[1];
    expect(url).toBe("http://127.0.0.1:3300/api/work");
    expect(options).toMatchObject({ method: "POST", redirect: "error", credentials: "omit", cache: "no-store", headers: { authorization: `Bearer ${key}`, "idempotency-key": input.idempotencyKey } });
    expect(JSON.parse(options!.body as string)).toEqual(job().input);
    expect(options!.headers).not.toHaveProperty("cookie");
  });

  it("clears a previously read chart if a refresh cannot be verified", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ context })).mockResolvedValueOnce(json({ context: { ...context, arbitraryChart: true } }));
    const client = new WorkConnectorClient({ assistantKey: key, fetch: fetcher });
    await client.readContext();
    await expect(client.readContext()).rejects.toMatchObject({ code: "invalid_response" });
    await expect(client.propose(input)).rejects.toMatchObject({ code: "context_required" });
  });

  it("supports status and cancellation after reconnect without disclosing another chart", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ job: job() })).mockResolvedValueOnce(json({ job: { ...job(), state: "cancelled" } }));
    const client = new WorkConnectorClient({ baseUrl: "http://127.0.0.1:3300/", assistantKey: key, fetch: fetcher });
    expect((await client.get(id)).id).toBe(id);
    expect((await client.cancel(id)).state).toBe("cancelled");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([`http://127.0.0.1:3300/api/work/${id}`, `http://127.0.0.1:3300/api/work/${id}/cancel`]);
    for (const malicious of ["../../reviewer/work", `${id}?approve=true`, "not-a-uuid", `${id}/decision`]) await expect(client.get(malicious)).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("never reports success without a verified receipt and separate proposal-bound approval", async () => {
    const approved = { ...job(), state: "succeeded", decision: { decision: "approve", subject: "reviewer-lab", at: job().updatedAt, proposalHash: job().proposalHash }, receipt: { resourceType: "Task", id: "saved-task", versionId: "1", verifiedAt: job().updatedAt } };
    for (const unsafe of [{ ...approved, receipt: undefined }, { ...approved, decision: undefined }, { ...approved, decision: { ...approved.decision, subject: "assistant-lab" } }, { ...approved, proposalHash: "0".repeat(64) }, { ...job(), receipt: approved.receipt }, { ...job(), id: "11111111-1111-1111-1111-111111111111" }]) {
      const client = new WorkConnectorClient({ assistantKey: key, fetch: async () => json({ job: unsafe }) });
      await expect(client.get(id)).rejects.toMatchObject({ code: "invalid_response" });
    }
    const client = new WorkConnectorClient({ assistantKey: key, fetch: async () => json({ job: approved }) });
    expect((await client.get(id)).receipt?.id).toBe("saved-task");
  });

  it("rejects a changed proposal even when the returned proposal hash is internally consistent", async () => {
    const changed = job();
    changed.proposal.description = "Attacker changed the reviewed content";
    changed.proposalHash = createHash("sha256").update(canonical(changed.proposal)).digest("hex");
    const client = new WorkConnectorClient({ assistantKey: key, fetch: async () => json({ job: changed }) });
    await expect(client.get(id)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("rejects invalid dates, unsafe idempotency keys and excessive description before submission", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new WorkConnectorClient({ assistantKey: key, fetch: fetcher });
    for (const value of [{ ...input, dueDate: "2026-02-30" }, { ...input, idempotencyKey: "key\nheader" }, { ...input, description: "x".repeat(2001) }, { ...input, description: "  " }, { ...input, approve: true }]) await expect(client.propose(value)).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("redacts transport and backend diagnostics into static errors", async () => {
    const upstreamSecret = "provider-key-and-patient-content-never-echo";
    for (const [status, code] of [[401, "unauthorized"], [403, "forbidden"], [404, "not_found"], [409, "conflict"], [410, "expired"], [503, "unavailable"], [500, "request_failed"]] as const) {
      const client = new WorkConnectorClient({ assistantKey: key, fetch: async () => json({ error: upstreamSecret, message: upstreamSecret }, status) });
      await expect(client.get(id)).rejects.toMatchObject({ code });
      try { await client.get(id); } catch (error) { expect(String(error)).not.toContain(upstreamSecret); }
    }
    const client = new WorkConnectorClient({ assistantKey: key, fetch: async () => { throw new Error(upstreamSecret); } });
    await expect(client.get(id)).rejects.toMatchObject({ code: "request_failed" });
  });

  it("rejects redirects, non-JSON and excessive declared or streamed responses", async () => {
    const cases: [Response, string][] = [
      [new Response(null, { status: 302, headers: { location: "http://attacker.invalid" } }), "invalid_response"],
      [new Response("<html>login</html>", { headers: { "content-type": "text/html" } }), "invalid_response"],
      [json({ context }, 200, { "content-length": "999999" }), "response_too_large"],
      [new Response("x".repeat(128 * 1024 + 1), { headers: { "content-type": "application/json" } }), "response_too_large"],
      [new Response("{broken json", { headers: { "content-type": "application/json" } }), "invalid_response"],
    ];
    for (const [response, code] of cases) {
      const client = new WorkConnectorClient({ assistantKey: key, fetch: async () => response });
      await expect(client.readContext()).rejects.toMatchObject({ code });
    }
  });

  it("bounds a stalled request even if an injected fetch does not honor abort", async () => {
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const client = new WorkConnectorClient({ assistantKey: key, timeoutMs: 10, fetch: fetcher });
    await expect(client.readContext()).rejects.toMatchObject({ code: "timeout" });
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
