import type { ExtractResource, Resource, ResourceType } from "@medplum/fhirtypes";

import { evidenceVersion, type EvidenceVersion } from "./evidence-version.js";
import { RESOURCE_REFERENCE, type SessionReadLog } from "./proposal-evidence.js";

// Re-read of the resources a proposal was grounded in.
//
// The pin is taken when the proposal is built: from this session's read of
// that resource when one is still held, otherwise from a read done then.
// After the reviewer approves, each pin is read again. A miss, a deletion,
// a different version, or a read that errors commits nothing. Search by id
// is the first read, because compartment access policies are enforced on
// search. A thrown search falls through to readResource when the client has
// one, which is how an Epic-style adapter that can read but not search still
// confirms the row. An empty search is "not there", not a prompt to try the
// other call.

const SAFE_REFERENCE = RESOURCE_REFERENCE;

export type EvidencePin = {
  reference: string;
  /** A supersession target is checked even when the agent did not cite it. */
  role: "cited" | "supersedes";
  /**
   * Null means the resource was already absent while the proposal was
   * prepared. Commit still refuses: a citation of a missing row is not
   * evidence that stayed put.
   */
  version: EvidenceVersion | null;
};

export type EvidenceCheck = { ok: true; pins: EvidencePin[] } | { ok: false; outcome: string };

type EvidenceReader = {
  searchResources<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<ExtractResource<K>[]>;
  readResource?<K extends ResourceType>(
    resourceType: K,
    id: string,
  ): Promise<ExtractResource<K>>;
};

type ReadResult =
  | { status: "found"; version: EvidenceVersion }
  | { status: "missing" }
  | { status: "error" };

const REREAD_HINT = "Read the chart again and propose again if the write still applies.";

function splitReference(
  reference: string,
): { resourceType: ResourceType; id: string } | undefined {
  if (!SAFE_REFERENCE.test(reference)) return undefined;
  const slash = reference.indexOf("/");
  return {
    resourceType: reference.slice(0, slash) as ResourceType,
    id: reference.slice(slash + 1),
  };
}

function statusCodeOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return undefined;
  const status = (error as { statusCode: unknown }).statusCode;
  return typeof status === "number" && Number.isInteger(status) ? status : undefined;
}

function isNotFound(error: unknown): boolean {
  const status = statusCodeOf(error);
  if (status === 404 || status === 410) return true;
  if (error && typeof error === "object" && "outcome" in error) {
    const issues = (error as { outcome?: { issue?: { code?: string }[] } }).outcome?.issue;
    if (issues?.some((issue) => issue.code === "not-found" || issue.code === "deleted")) {
      return true;
    }
  }
  // The in-process store's own not-found error. Other diagnostics can say
  // "not found" while the request failed for a different reason, and those
  // stay fail-closed as a read error.
  return (
    error instanceof Error &&
    /^FHIR resource [A-Z][A-Za-z0-9]{0,40}\/[A-Za-z0-9\-._]{1,64} was not found\.$/.test(
      error.message,
    )
  );
}

function versionOf(resource: Resource): EvidenceVersion | undefined {
  return evidenceVersion(resource);
}

async function readOne(
  client: EvidenceReader,
  resourceType: ResourceType,
  id: string,
): Promise<ReadResult> {
  try {
    const rows = await client.searchResources(resourceType, { _id: id, _count: "1" });
    const match = rows.find((row) => row.resourceType === resourceType && row.id === id);
    if (!match) return { status: "missing" };
    const version = versionOf(match);
    return version ? { status: "found", version } : { status: "error" };
  } catch {
    // Fall through to a direct read when this client has one. An empty
    // search returned above and is not a reason to try the other call.
  }
  if (!client.readResource) return { status: "error" };
  try {
    const resource = await client.readResource(resourceType, id);
    if (!resource || resource.resourceType !== resourceType || resource.id !== id) {
      return { status: "missing" };
    }
    const version = versionOf(resource);
    return version ? { status: "found", version } : { status: "error" };
  } catch (error) {
    return isNotFound(error) ? { status: "missing" } : { status: "error" };
  }
}

function problem(pin: EvidencePin, kind: "changed" | "missing" | "error"): string {
  const ref = pin.reference;
  if (pin.role === "supersedes") {
    if (kind === "changed") {
      return `${ref} changed since this proposal was prepared, so it is no longer the observation this write would supersede.`;
    }
    if (kind === "missing") {
      return `${ref} is missing or was deleted, so there is nothing to supersede.`;
    }
    return `${ref} could not be re-read, so it cannot be superseded.`;
  }
  if (kind === "changed") {
    return `Cited resource ${ref} changed since this proposal was prepared.`;
  }
  if (kind === "missing") {
    return `Cited resource ${ref} is missing or was deleted since this proposal was prepared.`;
  }
  return `Cited resource ${ref} could not be re-read.`;
}

function refused(sentences: string[]): EvidenceCheck {
  return {
    ok: false,
    outcome: `${sentences.join(" ")} Nothing was saved. ${REREAD_HINT}`,
  };
}

export async function prepareEvidencePins(input: {
  client: EvidenceReader;
  cited: readonly { reference: string }[];
  readLog?: SessionReadLog;
  /**
   * A resource this proposal already fetched and showed, such as the
   * observation a supersede links to. That read wins over an older session
   * read and over fetching it again.
   */
  known?: readonly { reference: string; resource: unknown }[];
  also?: readonly { reference: string; role: "supersedes" }[];
}): Promise<EvidenceCheck> {
  const targets: { reference: string; role: "cited" | "supersedes" }[] = [];
  const see = (reference: string, role: "cited" | "supersedes") => {
    const existing = targets.find((item) => item.reference === reference);
    if (!existing) {
      targets.push({ reference, role });
      return;
    }
    if (role === "supersedes") existing.role = "supersedes";
  };
  for (const item of input.cited) see(item.reference, "cited");
  for (const item of input.also ?? []) see(item.reference, item.role);
  if (targets.length === 0) return { ok: true, pins: [] };

  const known = new Map((input.known ?? []).map((item) => [item.reference, item.resource]));
  const pins: EvidencePin[] = [];
  for (const target of targets) {
    const parts = splitReference(target.reference);
    if (!parts) {
      return refused([
        "A cited reference is not a ResourceType/id this check can re-read.",
      ]);
    }
    const held = known.get(target.reference);
    if (held !== undefined) {
      const version = evidenceVersion(held);
      if (!version) {
        return refused([`${target.reference} could not be read while preparing this proposal.`]);
      }
      pins.push({ ...target, version });
      continue;
    }
    const fromSession = input.readLog?.evidenceVersionFor(target.reference);
    if (fromSession) {
      pins.push({ ...target, version: fromSession });
      continue;
    }
    const read = await readOne(input.client, parts.resourceType, parts.id);
    if (read.status === "error") {
      return refused([
        `Cited resource ${target.reference} could not be read while preparing this proposal.`,
      ]);
    }
    pins.push({
      ...target,
      version: read.status === "found" ? read.version : null,
    });
  }
  return { ok: true, pins };
}

export async function confirmEvidencePins(
  client: EvidenceReader,
  pins: readonly EvidencePin[],
): Promise<EvidenceCheck> {
  if (pins.length === 0) return { ok: true, pins: [] };
  const failures: string[] = [];
  for (const pin of pins) {
    const parts = splitReference(pin.reference);
    if (!parts) {
      failures.push(problem(pin, "error"));
      continue;
    }
    const read = await readOne(client, parts.resourceType, parts.id);
    if (read.status === "error") {
      failures.push(problem(pin, "error"));
      continue;
    }
    if (read.status === "missing") {
      failures.push(problem(pin, "missing"));
      continue;
    }
    if (!pin.version || read.version.token !== pin.version.token) {
      failures.push(problem(pin, "changed"));
    }
  }
  if (failures.length === 0) return { ok: true, pins: [...pins] };
  return refused(failures);
}
