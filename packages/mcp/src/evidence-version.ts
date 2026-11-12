import { createHash } from "node:crypto";

import {
  RESOURCE_REFERENCE,
  type EvidenceVersion,
  type SessionReadLog,
} from "./proposal-evidence.js";

// Version token for a chart resource a proposal relied on.
//
// Real FHIR servers (Medplum, HAPI, and the experimental REST adapters)
// assign meta.versionId and bump it on every update. meta.lastUpdated is
// the fallback when a server has a clock but no version id. The in-process
// memory store (FHIR_BACKEND=memory) assigns neither: it keeps the resource
// as written and never versions it. Those reads are pinned by a SHA-256 of
// the canonical JSON of the resource itself, so any field change produces
// a different token. The token stays inside the server. It is not shown to
// the model or the reviewer, because a content hash is derived from the
// chart row.

export type { EvidenceVersion };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Stable JSON for the content-hash fallback. Object keys are sorted so two
 * reads of the same resource hash the same when a server reorders keys.
 * Array order is kept: order is meaningful in FHIR. Undefined properties
 * are dropped, matching JSON serialization.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonical(item));
  if (!isRecord(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) sorted[key] = canonical(value[key]);
  }
  return sorted;
}

export function evidenceVersion(resource: unknown): EvidenceVersion | undefined {
  if (!isRecord(resource)) return undefined;
  const meta = isRecord(resource.meta) ? resource.meta : undefined;
  const versionId = meta ? nonEmpty(meta.versionId) : undefined;
  if (versionId) return { source: "versionId", token: `versionId:${versionId}` };
  const lastUpdated = meta ? nonEmpty(meta.lastUpdated) : undefined;
  if (lastUpdated) return { source: "lastUpdated", token: `lastUpdated:${lastUpdated}` };
  const hash = createHash("sha256").update(JSON.stringify(canonical(resource))).digest("hex");
  return { source: "content", token: `content:${hash}` };
}

function isResource(value: unknown): value is { resourceType: string; id?: string } {
  return isRecord(value) && typeof value.resourceType === "string";
}

/** Store the version of a FHIR resource a read just returned. */
export function rememberFetchedResource(log: SessionReadLog, resource: unknown): void {
  if (!isResource(resource) || resource.resourceType === "OperationOutcome") return;
  if (typeof resource.id !== "string") return;
  const reference = `${resource.resourceType}/${resource.id}`;
  if (!RESOURCE_REFERENCE.test(reference)) return;
  const version = evidenceVersion(resource);
  if (!version) return;
  log.rememberEvidenceVersion(reference, version);
}
