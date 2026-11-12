import { z } from "zod";

// Review metadata for a proposed write. Citations are what the agent says it
// relied on. The session read log is what chart tools actually returned
// before the proposal. Neither is written onto the FHIR resource an
// approval saves, and a missing citation does not approve or deny the write.

export const RESOURCE_REFERENCE =
  /^[A-Z][A-Za-z0-9]{0,40}\/[A-Za-z0-9\-._]{1,64}$/;

const MAX_CITATIONS = 8;
const MAX_READS = 12;
/**
 * Versions kept for resources this session actually fetched. The review list
 * is shorter on purpose. A citation whose read has fallen out of this map is
 * read again while the proposal is prepared.
 */
const MAX_EVIDENCE_VERSIONS = 128;
const MAX_FIELDS = 4;
const MAX_FIELD_CHARS = 160;
const MAX_DIFF_CHARS = 8_000;
const MAX_REVIEW_CHARS = 12_000;

export const NO_CITED_EVIDENCE =
  "No cited evidence. The agent did not name a chart resource this proposal relies on.";

export const NOT_IN_SESSION_READS = "Not in this session's reads.";

export const NO_SESSION_READS =
  "No chart resources were read in this session before this proposal.";

export const EVIDENCE_TOOL_SENTENCE =
  "Pass optional evidence (or basedOn) naming the ResourceType/id values this proposal relies on, each with a short reason, from reads earlier in this session. Omitting that list still proposes the write; the reviewer is shown that no evidence was cited.";

const EVIDENCE_FIELD_DESCRIPTION =
  "Chart resources this proposal relies on. Each item is a ResourceType/id from a prior read in this session (for example Observation/123), or { reference, reason }. Optional. basedOn is the same list.";

const BASED_ON_FIELD_DESCRIPTION =
  "Alias of evidence. A list of ResourceType/id values, or { reference, reason } objects. If both evidence and basedOn are set, they are combined. Optional.";

export type KeyField = { label: string; value: string };

export type SessionRead = {
  reference: string;
  resourceType: string;
  id: string;
  tool: string;
  keyFields: KeyField[];
};

export type CitedEvidence = {
  reference: string;
  reason?: string;
};

/**
 * Version token for a resource this session fetched. Computed by the server
 * (see evidence-version.ts). This module does not hash resources: the chat
 * UI imports it, and a content hash uses Node crypto.
 */
export type EvidenceVersion = {
  source: "versionId" | "lastUpdated" | "content";
  token: string;
};

export type CitedReview = CitedEvidence & {
  inSession: boolean;
  keyFields: KeyField[];
};

const FIELD_LABELS: readonly [string, string][] = [
  ["label", "Label"],
  ["value", "Value"],
  ["text", "Text"],
  ["name", "Name"],
  ["title", "Title"],
  ["date", "Date"],
  ["status", "Status"],
  ["dosage", "Dosage"],
  ["birthDate", "Birth date"],
  ["gender", "Gender"],
  ["contentType", "Content type"],
];

const COLLECTION_TYPES: Record<string, string> = {
  patients: "Patient",
  conditions: "Condition",
  allergies: "AllergyIntolerance",
  observations: "Observation",
  notes: "Communication",
  medications: "MedicationRequest",
  immunizations: "Immunization",
};

const READ_TOOLS = new Set([
  "search_patients",
  "show_patient_info",
  "read_chart_section",
  "read_document",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stripChartText(value: string): string {
  return value.replace(/<\/?chart_text>/g, "").replace(/\s+/g, " ").trim();
}

function clip(value: string): string {
  const clean = stripChartText(value);
  if (clean.length <= MAX_FIELD_CHARS) return clean;
  return `${clean.slice(0, MAX_FIELD_CHARS)}…`;
}

function keyFieldsFrom(row: Record<string, unknown>): KeyField[] {
  const fields: KeyField[] = [];
  for (const [key, label] of FIELD_LABELS) {
    const value = row[key];
    if (typeof value !== "string") continue;
    const cleaned = clip(value);
    if (!cleaned) continue;
    fields.push({ label, value: cleaned });
    if (fields.length >= MAX_FIELDS) break;
  }
  return fields;
}

const ID_PATTERN = /^[A-Za-z0-9\-._]{1,64}$/;
const TYPE_PATTERN = /^[A-Z][A-Za-z0-9]{0,40}$/;

function toSessionRead(
  resourceType: string,
  id: unknown,
  tool: string,
  row: Record<string, unknown>,
): SessionRead | undefined {
  if (typeof id !== "string" || !ID_PATTERN.test(id) || !TYPE_PATTERN.test(resourceType)) {
    return undefined;
  }
  return {
    reference: `${resourceType}/${id}`,
    resourceType,
    id,
    tool,
    keyFields: keyFieldsFrom(row),
  };
}

function pushRead(
  found: SessionRead[],
  resourceType: string,
  id: unknown,
  tool: string,
  row: Record<string, unknown>,
) {
  const read = toSessionRead(resourceType, id, tool, row);
  if (read) found.push(read);
}

function conceptText(code: unknown): string | undefined {
  if (!isRecord(code)) return undefined;
  if (typeof code.text === "string" && code.text.trim()) return code.text;
  const coding = code.coding;
  if (!Array.isArray(coding) || !isRecord(coding[0])) return undefined;
  return typeof coding[0].display === "string" ? coding[0].display : undefined;
}

function quantityText(quantity: unknown): string | undefined {
  if (!isRecord(quantity)) return undefined;
  const value = quantity.value;
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const unit = typeof quantity.unit === "string" ? quantity.unit : "";
  return `${value} ${unit}`.trim();
}

function unwrapOutput(output: unknown): unknown {
  if (isRecord(output) && output.type === "json" && "value" in output) {
    return output.value;
  }
  return output;
}

/**
 * Resource references a chart-read tool actually returned. Projections only:
 * the same rows the tool handed back, not a second fetch.
 */
export function readsFromToolOutput(tool: string, output: unknown): SessionRead[] {
  const body = unwrapOutput(output);
  if (!isRecord(body)) return [];
  const found: SessionRead[] = [];

  if (tool === "read_document" && typeof body.documentId === "string") {
    pushRead(found, "DocumentReference", body.documentId, tool, {
      title: body.title,
      date: body.date,
      contentType: body.contentType,
      text: body.text,
    });
  }

  if (tool === "read_chart_section" && typeof body.resourceType === "string" && Array.isArray(body.entries)) {
    for (const entry of body.entries) {
      if (!isRecord(entry)) continue;
      pushRead(found, body.resourceType, entry.id, tool, entry);
    }
  }

  if (Array.isArray(body.related)) {
    for (const entry of body.related) {
      if (!isRecord(entry) || typeof entry.resourceType !== "string") continue;
      pushRead(found, entry.resourceType, entry.id, tool, entry);
    }
  }

  if (isRecord(body.patient)) {
    pushRead(found, "Patient", body.patient.id, tool, body.patient);
  }

  for (const [key, resourceType] of Object.entries(COLLECTION_TYPES)) {
    const value = body[key];
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      if (!isRecord(entry)) continue;
      pushRead(found, resourceType, entry.id, tool, entry);
    }
  }

  const seen = new Set<string>();
  return found.filter((read) => {
    if (seen.has(read.reference)) return false;
    seen.add(read.reference);
    return true;
  });
}

/**
 * One MCP session's reads. Stdio is one process; remote HTTP builds one of
 * these per caller so one session cannot display another's chart reads.
 */
export class SessionReadLog {
  private reads: SessionRead[] = [];
  private dropped = false;
  /** Latest version token per reference, independent of the review-list cap. */
  private versions = new Map<string, EvidenceVersion>();

  record(tool: string, output: unknown): void {
    if (!READ_TOOLS.has(tool)) return;
    for (const read of readsFromToolOutput(tool, output)) this.upsert(read);
  }

  /**
   * Remember a version token for a reference this session fetched. The
   * caller computes the token from the FHIR resource; chart projections
   * shown to the model do not carry meta.
   */
  rememberEvidenceVersion(reference: string, version: EvidenceVersion): void {
    if (!RESOURCE_REFERENCE.test(reference)) return;
    this.versions.delete(reference);
    this.versions.set(reference, { source: version.source, token: version.token });
    while (this.versions.size > MAX_EVIDENCE_VERSIONS) {
      const oldest = this.versions.keys().next().value;
      if (oldest === undefined) break;
      this.versions.delete(oldest);
    }
  }

  /** The version from this session's latest retained read of that reference. */
  evidenceVersionFor(reference: string): EvidenceVersion | undefined {
    const version = this.versions.get(reference);
    return version ? { ...version } : undefined;
  }

  /** A FHIR resource fetched while preparing a proposal, such as the row a supersede links to. */
  noteResource(tool: string, resource: unknown): void {
    if (!isRecord(resource) || typeof resource.resourceType !== "string") return;
    const row: Record<string, unknown> = {};
    const label = conceptText(resource.code);
    if (label) row.label = label;
    const value = quantityText(resource.valueQuantity);
    if (value) row.value = value;
    else if (typeof resource.valueString === "string") row.value = resource.valueString;
    if (typeof resource.effectiveDateTime === "string") {
      row.date = resource.effectiveDateTime.slice(0, 10);
    }
    if (typeof resource.status === "string") row.status = resource.status;
    if (typeof resource.description === "string") row.text = resource.description;
    const read = toSessionRead(resource.resourceType, resource.id, tool, row);
    if (read) this.upsert(read);
  }

  snapshot(): SessionRead[] {
    return this.reads.map((read) => ({
      ...read,
      keyFields: read.keyFields.map((field) => ({ ...field })),
    }));
  }

  wasTruncated(): boolean {
    return this.dropped;
  }

  private upsert(read: SessionRead): void {
    this.reads = this.reads.filter((item) => item.reference !== read.reference);
    this.reads.push(read);
    if (this.reads.length > MAX_READS) {
      this.dropped = true;
      this.reads.splice(0, this.reads.length - MAX_READS);
    }
  }
}

export function reviewCitations(
  cited: readonly CitedEvidence[],
  reads: readonly SessionRead[],
): CitedReview[] {
  const byReference = new Map(reads.map((read) => [read.reference, read]));
  return cited.map((item) => {
    const read = byReference.get(item.reference);
    return {
      ...item,
      inSession: Boolean(read),
      keyFields: read ? read.keyFields.map((field) => ({ ...field })) : [],
    };
  });
}

function normalizeCited(value: unknown): CitedEvidence | undefined {
  if (typeof value === "string") {
    return RESOURCE_REFERENCE.test(value) ? { reference: value } : undefined;
  }
  if (!isRecord(value) || typeof value.reference !== "string") return undefined;
  if (!RESOURCE_REFERENCE.test(value.reference)) return undefined;
  if (typeof value.reason !== "string") return { reference: value.reference };
  const reason = value.reason.trim().slice(0, 240);
  return reason ? { reference: value.reference, reason } : { reference: value.reference };
}

function asCitedList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" || isRecord(value)) return [value];
  return [];
}

/**
 * Lenient reader for a proposal payload. Invalid items are dropped so a
 * review card can still render; the tool schema rejects the same input
 * before a write is asked for.
 */
export function parseCitedEvidence(input: unknown): CitedEvidence[] {
  if (!isRecord(input)) return [];
  const cited: CitedEvidence[] = [];
  const seen = new Set<string>();
  for (const item of [...asCitedList(input.evidence), ...asCitedList(input.basedOn)]) {
    const parsed = normalizeCited(item);
    if (!parsed || seen.has(parsed.reference)) continue;
    seen.add(parsed.reference);
    cited.push(parsed);
    if (cited.length >= MAX_CITATIONS) break;
  }
  return cited;
}

function referenceSchema() {
  return z
    .string()
    .regex(RESOURCE_REFERENCE)
    .describe(
      "ResourceType/id from a prior read in this session, for example Observation/123.",
    );
}

function evidenceItemSchema() {
  return z.union([
    referenceSchema(),
    z.object({
      reference: referenceSchema(),
      reason: z
        .string()
        .trim()
        .min(1)
        .max(240)
        .optional()
        .describe("Short reason this resource supports the proposal."),
    }),
  ]);
}

/** Optional on every write tool. Absent on existing calls. */
export function evidenceFields() {
  return {
    evidence: z
      .array(evidenceItemSchema())
      .max(MAX_CITATIONS)
      .optional()
      .describe(EVIDENCE_FIELD_DESCRIPTION),
    basedOn: z
      .array(evidenceItemSchema())
      .max(MAX_CITATIONS)
      .optional()
      .describe(BASED_ON_FIELD_DESCRIPTION),
  };
}

/** Unified diff of a create: the proposed resource against an empty chart. */
export function diffProposedCreate(resource: unknown): string {
  const resourceType =
    isRecord(resource) && typeof resource.resourceType === "string"
      ? resource.resourceType
      : "Resource";
  const body = JSON.stringify(resource, null, 2) ?? "";
  const lines = [
    "--- (not on the chart)",
    `+++ proposed ${resourceType}`,
    ...body.split("\n").map((line) => `+${line}`),
  ];
  let diff = lines.join("\n");
  if (diff.length > MAX_DIFF_CHARS) {
    diff = `${diff.slice(0, MAX_DIFF_CHARS)}\n+… diff truncated`;
  }
  return diff;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

/**
 * Text form of the review, for MCP elicitation. Free-text values are JSON
 * quoted so a newline inside a reason or a chart field cannot forge a new
 * summary line.
 */
export function formatProposalReview(input: {
  summary: string;
  proposed?: unknown;
  cited: readonly CitedEvidence[];
  /** Undefined when this caller has no session log. An empty array means nothing was read. */
  reads?: readonly SessionRead[];
  readsTruncated?: boolean;
}): string {
  const parts = [input.summary.trimEnd()];
  if (input.proposed !== undefined) {
    parts.push("", "Proposed change:", diffProposedCreate(input.proposed));
  }
  parts.push("", "Cited evidence:");
  const reviews = reviewCitations(input.cited, input.reads ?? []);
  if (reviews.length === 0) {
    parts.push(NO_CITED_EVIDENCE);
  } else {
    for (const item of reviews) {
      parts.push(`- ${item.reference}`);
      if (item.reason) parts.push(`  Reason: ${quote(item.reason)}`);
      for (const field of item.keyFields) {
        parts.push(`  ${field.label}: ${quote(field.value)}`);
      }
      if (!item.inSession) parts.push(`  ${NOT_IN_SESSION_READS}`);
    }
  }
  if (input.reads) {
    parts.push("", "Read before this proposal:");
    if (input.reads.length === 0) {
      parts.push(NO_SESSION_READS);
    } else {
      for (const read of input.reads) {
        parts.push(`- ${read.reference} (${read.tool})`);
        for (const field of read.keyFields) {
          parts.push(`  ${field.label}: ${quote(field.value)}`);
        }
      }
      if (input.readsTruncated) {
        parts.push(`Only the latest ${MAX_READS} resources read in this session are listed.`);
      }
    }
  }
  let text = parts.join("\n");
  if (text.length > MAX_REVIEW_CHARS) {
    text = `${text.slice(0, MAX_REVIEW_CHARS)}\n… review truncated`;
  }
  return text;
}

type TranscriptPart = {
  type?: string;
  toolCallId?: string;
  state?: string;
  output?: unknown;
};

/**
 * Reads already visible in a chat transcript, in order, stopping at the
 * proposal. This is the web card's session log: the approval renders before
 * the write executes, from tool results the conversation already holds.
 */
export function collectSessionReads(
  messages: readonly { parts?: readonly TranscriptPart[] }[],
  beforeToolCallId: string,
): { reads: SessionRead[]; truncated: boolean } {
  const log = new SessionReadLog();
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (part.toolCallId === beforeToolCallId) {
        return { reads: log.snapshot(), truncated: log.wasTruncated() };
      }
      if (part.state !== "output-available") continue;
      const type = part.type ?? "";
      if (!type.startsWith("tool-")) continue;
      log.record(type.slice("tool-".length), part.output);
    }
  }
  return { reads: log.snapshot(), truncated: log.wasTruncated() };
}
