import { createHash, randomUUID } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const WORK_JOB_IDENTIFIER = "https://lastehr.com/work-lab/job";

export type WorkActor = {
  tenantId: string;
  subject: string;
  role: "assistant" | "reviewer";
};

export type FollowUpInput = {
  patientId: string;
  source: { reference: string; versionId: string };
  description: string;
  dueDate?: string;
};

export type FollowUpTask = {
  resourceType: "Task";
  identifier: { system: string; value: string }[];
  status: "requested";
  intent: "order";
  for: { reference: string };
  focus: { reference: string };
  input: { type: { text: "Reviewed source version" }; valueString: string }[];
  description: string;
  restriction?: { period: { end: string } };
};

export type WorkTaskRecord = {
  id: string;
  resource: unknown;
  versionId?: string;
};

/** Implementations must enforce source ownership, caller policy and conditional-create semantics. */
export interface WorkCommitter {
  validateContext(input: {
    tenantId: string;
    patientId: string;
    source: FollowUpInput["source"];
  }): Promise<boolean>;
  findByJobId(input: { tenantId: string; jobId: string }): Promise<WorkTaskRecord[]>;
  conditionalCreate(input: {
    tenantId: string;
    jobId: string;
    proposal: FollowUpTask;
  }): Promise<WorkTaskRecord>;
}

export type WorkState =
  | "awaiting_review"
  | "committing"
  | "succeeded"
  | "denied"
  | "cancelled"
  | "expired"
  | "failed"
  | "needs_reconciliation";

export type WorkJob = {
  id: string;
  tenantId: string;
  requestedBy: string;
  reviewerSubject: string;
  state: WorkState;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  input: FollowUpInput;
  proposal: FollowUpTask;
  proposalHash: string;
  decision?: { decision: "approve" | "deny"; subject: string; at: string; proposalHash: string };
  receipt?: { resourceType: "Task"; id: string; versionId?: string; verifiedAt: string };
  failureCode?: "source_invalid" | "commit_unverified";
};

export type WorkErrorCode = "invalid_input" | "forbidden" | "not_found" | "conflict" | "expired";

export class WorkError extends Error {
  readonly statusCode: number;
  constructor(readonly code: WorkErrorCode) {
    super({
      invalid_input: "The work request is invalid.",
      forbidden: "This identity cannot perform this action.",
      not_found: "The work item was not found.",
      conflict: "The work item conflicts with the requested action.",
      expired: "The review period has expired.",
    }[code]);
    this.name = "WorkError";
    this.statusCode = { invalid_input: 400, forbidden: 403, not_found: 404, conflict: 409, expired: 410 }[code];
  }
}

type Row = {
  id: string;
  tenant_id: string;
  requested_by: string;
  reviewer_subject: string;
  state: WorkState;
  created_at: string;
  updated_at: string;
  expires_at: string;
  input_json: string;
  input_hash: string;
  proposal_json: string;
  proposal_hash: string;
  submission_key: string;
  decision_json: string | null;
  receipt_json: string | null;
  failure_code: WorkJob["failureCode"] | null;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${canonical(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

const fhirId = /^[A-Za-z0-9\-.]{1,64}$/;
const identity = /^[A-Za-z0-9._:@/-]{1,160}$/;
const submissionKey = /^[A-Za-z0-9._:-]{1,128}$/;

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseInput(value: unknown): FollowUpInput {
  if (!plainObject(value) || !exactKeys(value, ["patientId", "source", "description", "dueDate"]) ||
    typeof value.patientId !== "string" || !fhirId.test(value.patientId) ||
    !plainObject(value.source) || !exactKeys(value.source, ["reference", "versionId"]) ||
    typeof value.source.reference !== "string" || !/^Observation\/[A-Za-z0-9\-.]{1,64}$/.test(value.source.reference) ||
    typeof value.source.versionId !== "string" || !fhirId.test(value.source.versionId) ||
    typeof value.description !== "string" || value.description.trim().length < 1 || value.description.length > 2000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.description)) {
    throw new WorkError("invalid_input");
  }
  if (value.dueDate !== undefined && (typeof value.dueDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.dueDate) ||
    !Number.isFinite(Date.parse(value.dueDate)) ||
    new Date(value.dueDate).toISOString().slice(0, 10) !== value.dueDate)) {
    throw new WorkError("invalid_input");
  }
  return {
    patientId: value.patientId,
    source: { reference: value.source.reference, versionId: value.source.versionId },
    description: value.description.trim(),
    ...(value.dueDate === undefined ? {} : { dueDate: value.dueDate }),
  };
}

/** Strict equality permits only FHIR server-assigned id/meta in addition to the reviewed fields. */
export function matchesProposal(resource: unknown, proposal: FollowUpTask): boolean {
  if (!plainObject(resource)) return false;
  const fields = { ...resource };
  delete fields.id;
  delete fields.meta;
  return canonical(fields) === canonical(proposal);
}

function jobFrom(row: Row): WorkJob {
  return {
    id: row.id, tenantId: row.tenant_id, requestedBy: row.requested_by,
    reviewerSubject: row.reviewer_subject, state: row.state,
    createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at,
    input: JSON.parse(row.input_json), proposal: JSON.parse(row.proposal_json), proposalHash: row.proposal_hash,
    ...(row.decision_json ? { decision: JSON.parse(row.decision_json) } : {}),
    ...(row.receipt_json ? { receipt: JSON.parse(row.receipt_json) } : {}),
    ...(row.failure_code ? { failureCode: row.failure_code } : {}),
  };
}

/** A single-tenant, synthetic lab store. Identity is supplied by a trusted authenticated transport. */
export class DurableWorkService {
  private readonly db: DatabaseSync;
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(private readonly options: {
    storePath: string;
    reviewer: { tenantId: string; subject: string };
    committer: WorkCommitter;
    now?: () => number;
    ttlMs?: number;
  }) {
    if (typeof options.reviewer.tenantId !== "string" || !identity.test(options.reviewer.tenantId) ||
      typeof options.reviewer.subject !== "string" || !identity.test(options.reviewer.subject)) throw new WorkError("invalid_input");
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs < 1000 || this.ttlMs > 7 * 24 * 60 * 60 * 1000) throw new WorkError("invalid_input");
    const path = resolve(options.storePath);
    const directory = dirname(path);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const parent = lstatSync(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) !== 0 ||
      (process.getuid && parent.uid !== process.getuid())) throw new WorkError("invalid_input");
    const file = lstatSync(path, { throwIfNoEntry: false });
    if (file) {
      if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || (file.mode & 0o077) !== 0 ||
        (process.getuid && file.uid !== process.getuid())) throw new WorkError("invalid_input");
    }
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS work_jobs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        reviewer_subject TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        input_json TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        proposal_json TEXT NOT NULL,
        proposal_hash TEXT NOT NULL,
        submission_key TEXT NOT NULL,
        decision_json TEXT,
        receipt_json TEXT,
        failure_code TEXT,
        UNIQUE (tenant_id, requested_by, submission_key)
      );
    `);
  }

  close(): void { this.db.close(); }

  private timestamp(): string {
    const time = this.now();
    if (!Number.isSafeInteger(time) || time < 0 || !Number.isFinite(new Date(time).getTime())) throw new WorkError("invalid_input");
    return new Date(time).toISOString();
  }

  private authorize(actor: WorkActor, role?: WorkActor["role"]): void {
    if (!actor || typeof actor.subject !== "string" || !identity.test(actor.subject) || actor.tenantId !== this.options.reviewer.tenantId ||
      (actor.role !== "assistant" && actor.role !== "reviewer") || (role && actor.role !== role) ||
      (actor.role === "reviewer" && actor.subject !== this.options.reviewer.subject) ||
      (actor.role === "assistant" && actor.subject === this.options.reviewer.subject)) throw new WorkError("forbidden");
  }

  private load(id: string): Row {
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) throw new WorkError("not_found");
    const row = this.db.prepare("SELECT * FROM work_jobs WHERE id = ?").get(id) as Row | undefined;
    if (!row) throw new WorkError("not_found");
    return row;
  }

  private expire(id: string): void {
    const at = this.timestamp();
    this.db.prepare("UPDATE work_jobs SET state = 'expired', updated_at = ? WHERE id = ? AND state = 'awaiting_review' AND expires_at <= ?").run(at, id, at);
  }

  async get(actor: WorkActor, id: string): Promise<WorkJob> {
    this.authorize(actor);
    const row = this.load(id);
    if (row.tenant_id !== actor.tenantId || (actor.role === "assistant" && row.requested_by !== actor.subject)) throw new WorkError("not_found");
    this.expire(id);
    return jobFrom(this.load(id));
  }

  async list(actor: WorkActor): Promise<WorkJob[]> {
    this.authorize(actor, "reviewer");
    const at = this.timestamp();
    this.db.prepare("UPDATE work_jobs SET state = 'expired', updated_at = ? WHERE tenant_id = ? AND state = 'awaiting_review' AND expires_at <= ?").run(at, actor.tenantId, at);
    return (this.db.prepare("SELECT * FROM work_jobs WHERE tenant_id = ? AND reviewer_subject = ? ORDER BY created_at DESC LIMIT 100").all(actor.tenantId, actor.subject) as Row[]).map(jobFrom);
  }

  async submit(actor: WorkActor, value: unknown, idempotencyKey: string): Promise<WorkJob> {
    this.authorize(actor, "assistant");
    if (typeof idempotencyKey !== "string" || !submissionKey.test(idempotencyKey)) throw new WorkError("invalid_input");
    const input = parseInput(value);
    const inputHash = hash(input);
    const id = randomUUID();
    const at = this.timestamp();
    const expiresAt = new Date(Date.parse(at) + this.ttlMs).toISOString();
    const proposal: FollowUpTask = {
      resourceType: "Task", identifier: [{ system: WORK_JOB_IDENTIFIER, value: id }],
      status: "requested", intent: "order", for: { reference: `Patient/${input.patientId}` },
      focus: { reference: input.source.reference },
      // Some FHIR servers normalize versioned References. Preserve the reviewed
      // version as a FHIR Task input string so exact verification stays portable.
      input: [{ type: { text: "Reviewed source version" }, valueString: `${input.source.reference}/_history/${input.source.versionId}` }],
      description: input.description,
      ...(input.dueDate ? { restriction: { period: { end: input.dueDate } } } : {}),
    };
    this.db.prepare(`INSERT INTO work_jobs (id, tenant_id, requested_by, reviewer_subject, state, created_at, updated_at,
      expires_at, input_json, input_hash, proposal_json, proposal_hash, submission_key)
      VALUES (?, ?, ?, ?, 'awaiting_review', ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (tenant_id, requested_by, submission_key) DO NOTHING`).run(
      id, actor.tenantId, actor.subject, this.options.reviewer.subject, at, at, expiresAt,
      canonical(input), inputHash, canonical(proposal), hash(proposal), idempotencyKey,
    );
    const row = this.db.prepare("SELECT * FROM work_jobs WHERE tenant_id = ? AND requested_by = ? AND submission_key = ?").get(actor.tenantId, actor.subject, idempotencyKey) as Row;
    if (row.input_hash !== inputHash) throw new WorkError("conflict");
    return this.get(actor, row.id);
  }

  async decide(actor: WorkActor, id: string, value: unknown): Promise<WorkJob> {
    this.authorize(actor, "reviewer");
    if (!plainObject(value) || !exactKeys(value, ["decision", "proposalHash"]) ||
      (value.decision !== "approve" && value.decision !== "deny") || typeof value.proposalHash !== "string" || !/^[a-f0-9]{64}$/.test(value.proposalHash)) throw new WorkError("invalid_input");
    const job = await this.get(actor, id);
    if (job.requestedBy === actor.subject || job.reviewerSubject !== actor.subject) throw new WorkError("forbidden");
    if (job.proposalHash !== value.proposalHash) throw new WorkError("conflict");
    if (job.state === "expired") throw new WorkError("expired");
    if (job.state !== "awaiting_review") {
      if (job.decision?.decision === value.decision && job.decision.proposalHash === value.proposalHash) return job;
      throw new WorkError("conflict");
    }
    const at = this.timestamp();
    const decision = { ...value, subject: actor.subject, at };
    const state = value.decision === "approve" ? "committing" : "denied";
    const changed = this.db.prepare("UPDATE work_jobs SET state = ?, decision_json = ?, updated_at = ? WHERE id = ? AND state = 'awaiting_review' AND proposal_hash = ? AND expires_at > ?")
      .run(state, canonical(decision), at, id, value.proposalHash, at).changes;
    if (changed === 0) return this.decide(actor, id, value);
    if (state === "committing") await this.commit(id);
    return this.get(actor, id);
  }

  async cancel(actor: WorkActor, id: string): Promise<WorkJob> {
    this.authorize(actor, "assistant");
    const job = await this.get(actor, id);
    if (job.state === "cancelled") return job;
    if (job.state !== "awaiting_review") throw new WorkError("conflict");
    this.db.prepare("UPDATE work_jobs SET state = 'cancelled', updated_at = ? WHERE id = ? AND state = 'awaiting_review'").run(this.timestamp(), id);
    const result = await this.get(actor, id);
    if (result.state !== "cancelled") throw new WorkError("conflict");
    return result;
  }

  private uniqueMatch(records: WorkTaskRecord[], proposal: FollowUpTask): WorkTaskRecord | undefined {
    if (records.length !== 1) return undefined;
    const record = records[0];
    if (typeof record.id !== "string" || !fhirId.test(record.id) ||
      (record.versionId !== undefined && (typeof record.versionId !== "string" || !fhirId.test(record.versionId))) ||
      !plainObject(record.resource) || record.resource.id !== record.id || !matchesProposal(record.resource, proposal)) return undefined;
    if (record.versionId !== undefined && (!plainObject(record.resource.meta) || record.resource.meta.versionId !== record.versionId)) return undefined;
    return record;
  }

  private hasBoundApproval(job: WorkJob): boolean {
    return job.tenantId === this.options.reviewer.tenantId &&
      job.reviewerSubject === this.options.reviewer.subject &&
      job.decision?.decision === "approve" && job.decision.subject === job.reviewerSubject &&
      job.decision.subject !== job.requestedBy && job.decision.proposalHash === job.proposalHash &&
      hash(job.proposal) === job.proposalHash;
  }

  private success(id: string, record: WorkTaskRecord): void {
    const at = this.timestamp();
    const receipt = { resourceType: "Task", id: record.id, ...(record.versionId ? { versionId: record.versionId } : {}), verifiedAt: at };
    this.db.prepare("UPDATE work_jobs SET state = 'succeeded', receipt_json = ?, failure_code = NULL, updated_at = ? WHERE id = ? AND state IN ('committing', 'needs_reconciliation')").run(canonical(receipt), at, id);
  }

  private uncertain(id: string): void {
    this.db.prepare("UPDATE work_jobs SET state = 'needs_reconciliation', failure_code = 'commit_unverified', updated_at = ? WHERE id = ? AND state IN ('committing', 'needs_reconciliation')").run(this.timestamp(), id);
  }

  private async commit(id: string): Promise<void> {
    const job = jobFrom(this.load(id));
    if (!this.hasBoundApproval(job)) { this.uncertain(id); return; }
    try {
      const contextValid = await this.options.committer.validateContext({ tenantId: job.tenantId, patientId: job.input.patientId, source: job.input.source });
      if (!contextValid) {
        this.db.prepare("UPDATE work_jobs SET state = 'failed', failure_code = 'source_invalid', updated_at = ? WHERE id = ? AND state = 'committing'").run(this.timestamp(), id);
        return;
      }
      const lookup = { tenantId: job.tenantId, jobId: job.id };
      const existing = await this.options.committer.findByJobId(lookup);
      if (existing.length !== 0) {
        const match = this.uniqueMatch(existing, job.proposal);
        if (match) this.success(id, match); else this.uncertain(id);
        return;
      }
      const result = await this.options.committer.conditionalCreate({ ...lookup, proposal: job.proposal });
      const match = this.uniqueMatch(await this.options.committer.findByJobId(lookup), job.proposal);
      if (match && match.id === result.id) this.success(id, match); else this.uncertain(id);
    } catch {
      // The request may have reached FHIR before the error. A later recovery only reads.
      this.uncertain(id);
    }
  }

  /** Reconcile interrupted writes by identifier; never turn an uncertain outcome into a second create. */
  async recover(options: { limit?: number; signal?: AbortSignal; workId?: string } = {}): Promise<WorkJob[]> {
    const limit = options.limit === undefined ? 1000 : options.limit;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new WorkError("invalid_input");
    if (options.workId !== undefined && (typeof options.workId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(options.workId))) throw new WorkError("invalid_input");
    if (options.signal?.aborted) return [];
    const rows = (options.workId !== undefined
      ? this.db.prepare("SELECT * FROM work_jobs WHERE state IN ('committing', 'needs_reconciliation') AND id = ? ORDER BY created_at LIMIT ?").all(options.workId, limit)
      : this.db.prepare("SELECT * FROM work_jobs WHERE state IN ('committing', 'needs_reconciliation') ORDER BY created_at LIMIT ?").all(limit)) as Row[];
    const processed: Row[] = [];
    for (const row of rows) {
      if (options.signal?.aborted) break;
      const job = jobFrom(row);
      if (!this.hasBoundApproval(job)) { this.uncertain(job.id); processed.push(row); continue; }
      try {
        const match = this.uniqueMatch(await this.options.committer.findByJobId({ tenantId: job.tenantId, jobId: job.id }), job.proposal);
        if (match) this.success(job.id, match); else this.uncertain(job.id);
      } catch { this.uncertain(job.id); }
      processed.push(row);
    }
    return processed.map((row) => jobFrom(this.load(row.id)));
  }
}
