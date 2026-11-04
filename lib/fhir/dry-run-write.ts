import { randomUUID } from "node:crypto";

import type { Resource } from "@medplum/fhirtypes";

import type { FhirBackend } from "./backend";
import { DRY_RUN_OUTCOME } from "./dry-run-result";

export { DRY_RUN_OUTCOME };

const MAX_STAGED = 32;
const MAX_DIFF_CHARS = 12_000;

export type StagedWrite = {
  stagedId: string;
  resourceType: string;
  /** The proposed resource, with no invented server id. */
  resource: Resource;
  stagedAt: string;
};

export type DryRunCommit = {
  persisted: false;
  dryRun: true;
  stagedId: string;
  resourceType: string;
  diff: string;
};

const stagedByBackend = new WeakMap<object, StagedWrite[]>();

export function writeDispositionOf(
  backend: FhirBackend,
): "persist" | "dry-run" {
  return backend.writeDisposition === "dry-run" ? "dry-run" : "persist";
}

/** Unified diff of "not on the server" against the proposed resource. */
export function diffProposedResource(resource: Resource): string {
  const body = JSON.stringify(resource, null, 2);
  const lines = [
    "--- (not on the FHIR server)",
    `+++ staged ${resource.resourceType} (not written)`,
    ...body.split("\n").map((line) => `+${line}`),
  ];
  let diff = lines.join("\n");
  if (diff.length > MAX_DIFF_CHARS) {
    diff = `${diff.slice(0, MAX_DIFF_CHARS)}\n+… diff truncated`;
  }
  return diff;
}

export function stageDryRunWrite(
  backend: object,
  resource: Resource,
): DryRunCommit {
  const staged: StagedWrite = {
    stagedId: `dry-run-${randomUUID()}`,
    resourceType: resource.resourceType,
    resource,
    stagedAt: new Date().toISOString(),
  };
  const existing = stagedByBackend.get(backend) ?? [];
  existing.push(staged);
  stagedByBackend.set(backend, existing.slice(-MAX_STAGED));
  return {
    persisted: false,
    dryRun: true,
    stagedId: staged.stagedId,
    resourceType: staged.resourceType,
    diff: diffProposedResource(resource),
  };
}

export function listStagedWrites(backend: object): readonly StagedWrite[] {
  return stagedByBackend.get(backend) ?? [];
}

export type ApprovedWriteCommit<T extends Resource> =
  | { persisted: true; resource: T & { id: string } }
  | DryRunCommit;

/**
 * The approval gate's commit step. A dry-run backend stages the proposed
 * resource and returns a diff. It does not call `createResource`, so a
 * read-only server is never asked to pretend a write succeeded.
 */
export async function commitApprovedWrite<T extends Resource>(
  backend: FhirBackend,
  resource: T,
): Promise<ApprovedWriteCommit<T>> {
  if (writeDispositionOf(backend) === "dry-run") {
    return stageDryRunWrite(backend, resource);
  }
  const created = await backend.createResource(resource);
  return { persisted: true, resource: created };
}

export function dryRunToolResult(
  committed: DryRunCommit,
  summary: string,
  extra: Record<string, unknown> = {},
): DryRunCommit & { summary: string; outcome: string } {
  return {
    ...extra,
    persisted: false,
    dryRun: true,
    stagedId: committed.stagedId,
    resourceType: committed.resourceType,
    summary,
    diff: committed.diff,
    outcome: DRY_RUN_OUTCOME,
  };
}
