import { createHash } from "node:crypto";
import { z } from "zod";

import { workContextSchema, type WorkAssistantContext } from "./context";
import type { WorkJob } from "./service";

const messages = {
  invalid_configuration: "Use a numeric loopback Work Lab URL and a valid assistant key.",
  invalid_input: "The connector input is invalid. Check the tool contract.",
  context_required: "Read the bounded synthetic chart before proposing work.",
  source_mismatch: "Use the exact observation reference and version returned by the chart read.",
  unauthorized: "The Work Lab assistant credential was not accepted.",
  forbidden: "This assistant cannot perform that action.",
  not_found: "This work item was not found for the assistant.",
  conflict: "The work changed or this idempotency key belongs to a different proposal.",
  expired: "The review period expired. Read the chart and submit a fresh proposal.",
  unavailable: "The local Work Lab or its bounded chart reader is unavailable.",
  invalid_response: "The Work Lab returned an invalid response. No verified save can be reported.",
  response_too_large: "The Work Lab response exceeds the connector size limit.",
  timeout: "The Work Lab request timed out. Its outcome may be uncertain; check status or retry the same proposal key.",
  request_failed: "The Work Lab request failed. Its outcome may be uncertain; check status or retry the same proposal key.",
} as const;

export class WorkConnectorError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "WorkConnectorError";
  }
}

const fhirId = z.string().regex(/^[A-Za-z0-9\-.]{1,64}$/);
const jobId = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z.string().regex(/^[A-Za-z0-9._:@/-]{1,160}$/);
const timestamp = z.string().datetime({ offset: true });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
const description = z.string().min(1).max(2000).refine((value) => value.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));
const reference = z.string().regex(/^Observation\/[A-Za-z0-9\-.]{1,64}$/);
const proposalInput = z.object({
  description, dueDate: date.optional(), sourceReference: reference,
  sourceVersionId: fhirId, idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  contextReceipt: z.string().uuid().optional(),
}).strict();
const inputSchema = z.object({
  patientId: fhirId, source: z.object({ reference, versionId: fhirId }).strict(),
  description, dueDate: date.optional(),
}).strict();
const proposalSchema = z.object({
  resourceType: z.literal("Task"),
  identifier: z.array(z.object({ system: z.literal("https://lastehr.com/work-lab/job"), value: jobId }).strict()).length(1),
  status: z.literal("requested"), intent: z.literal("order"),
  for: z.object({ reference: z.string().regex(/^Patient\/[A-Za-z0-9\-.]{1,64}$/) }).strict(),
  focus: z.object({ reference }).strict(),
  input: z.array(z.object({ type: z.object({ text: z.literal("Reviewed source version") }).strict(), valueString: z.string().max(170) }).strict()).length(1),
  description,
  restriction: z.object({ period: z.object({ end: date }).strict() }).strict().optional(),
}).strict();
const jobSchema = z.object({
  id: jobId, tenantId: identity, requestedBy: identity, reviewerSubject: identity,
  state: z.enum(["awaiting_review", "committing", "succeeded", "denied", "cancelled", "expired", "failed", "needs_reconciliation"]),
  createdAt: timestamp, updatedAt: timestamp, expiresAt: timestamp,
  input: inputSchema, proposal: proposalSchema, proposalHash: hash,
  decision: z.object({ decision: z.enum(["approve", "deny"]), subject: identity, at: timestamp, proposalHash: hash }).strict().optional(),
  receipt: z.object({ resourceType: z.literal("Task"), id: fhirId, versionId: fhirId.optional(), verifiedAt: timestamp }).strict().optional(),
  failureCode: z.enum(["source_invalid", "commit_unverified"]).optional(),
}).strict();

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseJob(value: unknown): WorkJob {
  const parsed = z.object({ job: jobSchema }).strict().safeParse(value);
  if (!parsed.success) throw new WorkConnectorError("invalid_response");
  const job = parsed.data.job;
  const proposal = job.proposal;
  const approved = job.decision?.decision === "approve";
  if (job.requestedBy === job.reviewerSubject || proposal.identifier[0].value !== job.id ||
    proposal.for.reference !== `Patient/${job.input.patientId}` || proposal.focus.reference !== job.input.source.reference ||
    proposal.input[0].valueString !== `${job.input.source.reference}/_history/${job.input.source.versionId}` ||
    proposal.description !== job.input.description || proposal.restriction?.period.end !== job.input.dueDate ||
    createHash("sha256").update(canonical(proposal)).digest("hex") !== job.proposalHash ||
    (job.decision && (job.decision.subject !== job.reviewerSubject || job.decision.proposalHash !== job.proposalHash)) ||
    (["committing", "succeeded", "failed", "needs_reconciliation"].includes(job.state) && !approved) ||
    (job.state === "denied" && job.decision?.decision !== "deny") ||
    (["awaiting_review", "cancelled", "expired"].includes(job.state) && job.decision !== undefined) ||
    (job.state === "succeeded" ? !job.receipt || job.failureCode !== undefined : job.receipt !== undefined)) {
    throw new WorkConnectorError("invalid_response");
  }
  return job;
}

/** Assistant-only transport to the local synthetic Work Lab. No reviewer operation is exposed. */
export class WorkConnectorClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private context?: WorkAssistantContext;

  constructor(private readonly options: { baseUrl?: string; assistantKey: string; fetch?: typeof fetch; timeoutMs?: number }) {
    const base = options.baseUrl ?? "http://127.0.0.1:3300";
    const match = typeof base === "string" ? base.match(/^http:\/\/127\.0\.0\.1:([1-9][0-9]{3,4})\/?$/) : null;
    if (!match || Number(match[1]) < 1024 || Number(match[1]) > 65535 ||
      typeof options.assistantKey !== "string" || options.assistantKey.length < 32 || options.assistantKey.length > 4096 ||
      !/^[\x21-\x7e]+$/.test(options.assistantKey)) throw new WorkConnectorError("invalid_configuration");
    this.baseUrl = base.replace(/\/$/, "");
    this.fetcher = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 10 || this.timeoutMs > 30_000) throw new WorkConnectorError("invalid_configuration");
  }

  private async request(path: string, method = "GET", body?: unknown, idempotencyKey?: string): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new WorkConnectorError("timeout")); }, this.timeoutMs);
    });
    const perform = async (): Promise<unknown> => {
      const url = `${this.baseUrl}${path}`;
      const response = await this.fetcher(url, {
        method, headers: { authorization: `Bearer ${this.options.assistantKey}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }), ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: "omit", redirect: "error", cache: "no-store", signal: controller.signal,
      });
      if (response.redirected || (response.url && response.url !== url) || (response.status >= 300 && response.status < 400)) throw new WorkConnectorError("invalid_response");
      if (!response.ok) {
        await response.body?.cancel();
        const codes: Record<number, keyof typeof messages> = { 400: "invalid_input", 401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict", 410: "expired", 503: "unavailable" };
        throw new WorkConnectorError(codes[response.status] ?? "request_failed");
      }
      if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !response.body) throw new WorkConnectorError("invalid_response");
      const limit = 128 * 1024;
      const declaredLength = response.headers.get("content-length");
      if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > limit)) {
        await response.body.cancel();
        throw new WorkConnectorError("response_too_large");
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) { await reader.cancel(); throw new WorkConnectorError("response_too_large"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { throw new WorkConnectorError("invalid_response"); }
    };
    try { return await Promise.race([perform(), timeout]); }
    catch (error) { throw error instanceof WorkConnectorError ? error : new WorkConnectorError("request_failed"); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }

  async readContext(): Promise<WorkAssistantContext> {
    // A failed refresh must never leave a previously read version usable for drafting.
    this.context = undefined;
    const result = z.object({ context: workContextSchema }).strict().safeParse(await this.request("/api/work/context"));
    if (!result.success) throw new WorkConnectorError("invalid_response");
    this.context = structuredClone(result.data.context);
    return structuredClone(this.context);
  }

  async propose(input: unknown): Promise<WorkJob> {
    const parsed = proposalInput.safeParse(input);
    if (!parsed.success) throw new WorkConnectorError("invalid_input");
    if (!this.context) throw new WorkConnectorError("context_required");
    const value = parsed.data;
    if (value.sourceReference !== this.context.observation.reference || value.sourceVersionId !== this.context.observation.versionId) throw new WorkConnectorError("source_mismatch");
    const body = { patientId: this.context.patient.reference.slice("Patient/".length), source: { reference: value.sourceReference, versionId: value.sourceVersionId }, description: value.description.trim(), ...(value.dueDate ? { dueDate: value.dueDate } : {}) };
    const job = parseJob(await this.request("/api/work", "POST", body, value.idempotencyKey));
    if (canonical(job.input) !== canonical(body)) throw new WorkConnectorError("invalid_response");
    return job;
  }

  async get(id: string): Promise<WorkJob> {
    if (!jobId.safeParse(id).success) throw new WorkConnectorError("invalid_input");
    const job = parseJob(await this.request(`/api/work/${id}`));
    if (job.id !== id) throw new WorkConnectorError("invalid_response");
    return job;
  }

  async cancel(id: string): Promise<WorkJob> {
    if (!jobId.safeParse(id).success) throw new WorkConnectorError("invalid_input");
    const job = parseJob(await this.request(`/api/work/${id}/cancel`, "POST"));
    if (job.id !== id || job.state !== "cancelled") throw new WorkConnectorError("invalid_response");
    return job;
  }
}
