import { randomUUID } from "node:crypto";

import type {
  Bundle,
  ExtractResource,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";

import type { FhirWriteClient } from "./write-tools.js";

/**
 * In-process FHIR R4 store for FHIR_BACKEND=memory.
 *
 * It implements the behavioral FhirBackend contract (search, searchResources,
 * createResource, deleteResource): structured parameters, meta.tag kept as
 * written, `_id`, `identifier`, `_tag`, and `_tag:not` including a bare
 * system token. `memory.contract.test.ts` runs that harness.
 *
 * It is not an HTTP server, so the REST wire contract
 * (test/fhir-rest-adapter-contract.ts) does not apply: no request headers,
 * no CapabilityStatement, no OperationOutcome body, no redirects.
 *
 * Search subset, rejected rather than ignored when unsupported:
 * - No Bundle.link. `_count` returns the first page and drops the rest.
 *   Omitting `_count` returns every match.
 * - `_include` and `_revinclude` are rejected. The chart reader reports
 *   includeUnsupported and retries without them.
 * - `name` is a case-insensitive prefix on each HumanName part. A
 *   multi-word query matches when every word matches some part.
 * - Date filters compare the bound's calendar precision to the start of
 *   the stored datetime. No period indexes and no timezone conversion.
 * - `patient` and `subject` match a top-level subject, patient, for, or
 *   beneficiary reference. Nested references such as AuditEvent.agent are
 *   not matched.
 * - No compartments and no authentication. The remote HTTP transport is
 *   refused in config.
 *
 * Rows live until this process exits. Nothing is written to a FHIR server.
 */

const DATE_PATHS: Record<string, readonly string[]> = {
  date: ["effectiveDateTime", "occurrenceDateTime", "date", "recordedDate"],
  sent: ["sent"],
  "recorded-date": ["recordedDate"],
  authoredon: ["authoredOn"],
  "authored-on": ["authoredOn"],
  authored: ["authoredOn", "authored"],
  "start-date": ["startDate"],
  whenhandedover: ["whenHandedOver"],
  collected: ["collection.collectedDateTime"],
};

const TOKEN_PATHS: Record<string, readonly string[]> = {
  status: ["status"],
  "clinical-status": ["clinicalStatus"],
  "lifecycle-status": ["lifecycleStatus"],
  code: ["code", "medicationCodeableConcept"],
  category: ["category"],
  "vaccine-code": ["vaccineCode"],
  type: ["type"],
};

const PATIENT_REFERENCE_FIELDS = ["subject", "patient", "for", "beneficiary"] as const;

type CodingLike = { system?: string; code?: string };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function unsupported(name: string): Error {
  const safe = /^[A-Za-z0-9:._-]{1,64}$/.test(name) ? name : "an unsupported parameter";
  return new Error(`In-memory FHIR search does not implement ${safe}.`);
}

function orTokens(raw: string): string[] {
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

function valueAt(resource: unknown, path: string): unknown {
  let current = resource;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function codingMatches(coding: CodingLike, token: string): boolean {
  const pipe = token.indexOf("|");
  if (pipe === -1) return coding.code === token;
  const system = token.slice(0, pipe);
  const code = token.slice(pipe + 1);
  if (system && coding.system !== system) return false;
  if (!system && coding.system) return false;
  if (code === "") return Boolean(system);
  return coding.code === code;
}

function tokenMatches(value: unknown, token: string): boolean {
  if (typeof value === "string") {
    const pipe = token.indexOf("|");
    if (pipe === -1) return value === token;
    const code = token.slice(pipe + 1);
    return token.slice(0, pipe) === "" && value === code;
  }
  if (Array.isArray(value)) return value.some((item) => tokenMatches(item, token));
  if (!value || typeof value !== "object") return false;
  const record = value as { coding?: unknown; system?: unknown; code?: unknown };
  if (Array.isArray(record.coding)) {
    return record.coding.some((coding) => tokenMatches(coding, token));
  }
  if (typeof record.code === "string" || typeof record.system === "string") {
    return codingMatches(
      {
        system: typeof record.system === "string" ? record.system : undefined,
        code: typeof record.code === "string" ? record.code : undefined,
      },
      token,
    );
  }
  return false;
}

function tagsOf(resource: Resource): CodingLike[] {
  const tag = resource.meta?.tag;
  if (!Array.isArray(tag)) return [];
  return tag.flatMap((entry) =>
    entry && typeof entry === "object"
      ? [{ system: entry.system, code: entry.code }]
      : [],
  );
}

function hasTag(resource: Resource, raw: string): boolean {
  const tags = tagsOf(resource);
  return orTokens(raw).some((token) => tags.some((tag) => codingMatches(tag, token)));
}

function identifierMatches(resource: Resource, raw: string): boolean {
  const identifiers = (resource as { identifier?: { system?: string; value?: string }[] })
    .identifier;
  if (!Array.isArray(identifiers)) return false;
  return orTokens(raw).some((token) => {
    const pipe = token.indexOf("|");
    return identifiers.some((identifier) => {
      if (pipe === -1) return identifier.value === token;
      const system = token.slice(0, pipe);
      const value = token.slice(pipe + 1);
      if (system && identifier.system !== system) return false;
      if (value === "") return Boolean(system);
      return identifier.value === value;
    });
  });
}

function nameParts(resource: Resource): string[] {
  const name = (resource as { name?: unknown }).name;
  if (typeof name === "string") return [name];
  if (!Array.isArray(name)) return [];
  const parts: string[] = [];
  for (const entry of name) {
    if (!entry || typeof entry !== "object") continue;
    const human = entry as {
      text?: string;
      family?: string;
      given?: string[];
      prefix?: string[];
      suffix?: string[];
    };
    if (human.text) parts.push(human.text);
    if (human.family) parts.push(human.family);
    for (const given of human.given ?? []) parts.push(given);
    for (const prefix of human.prefix ?? []) parts.push(prefix);
    for (const suffix of human.suffix ?? []) parts.push(suffix);
  }
  return parts;
}

/**
 * Case-insensitive prefix on each name part. Every whitespace-separated
 * word must match some part, so "Maria Garcia" matches given + family.
 * A FHIR string search that keeps the whole phrase as one token does not.
 */
function nameMatches(resource: Resource, query: string): boolean {
  const parts = nameParts(resource).map((part) => part.toLowerCase());
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || parts.length === 0) return false;
  return words.every((word) => parts.some((part) => part.startsWith(word)));
}

function collectRefs(value: unknown, refs: string[]): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs);
    return;
  }
  if (typeof value === "object" && value && "reference" in value) {
    const reference = (value as { reference?: unknown }).reference;
    if (typeof reference === "string") refs.push(reference);
  }
}

function referenceMatches(resource: Resource, raw: string): boolean {
  const refs: string[] = [];
  const record = resource as unknown as Record<string, unknown>;
  for (const field of PATIENT_REFERENCE_FIELDS) collectRefs(record[field], refs);
  const wanted = raw.startsWith("Patient/") ? raw.slice("Patient/".length) : raw;
  return refs.some(
    (reference) => reference === raw || reference === `Patient/${wanted}`,
  );
}

function dateStrings(resource: Resource, param: string): string[] {
  const paths = DATE_PATHS[param] ?? [];
  const values: string[] = [];
  for (const path of paths) {
    const value = valueAt(resource, path);
    if (typeof value === "string" && value) values.push(value);
  }
  return values;
}

function compareDate(value: string, prefix: string, bound: string): boolean {
  const left = value.slice(0, bound.length);
  if (prefix === "eq") return left === bound;
  if (prefix === "ne") return left !== bound;
  if (prefix === "gt") return left > bound;
  if (prefix === "lt") return left < bound;
  if (prefix === "ge") return left >= bound;
  if (prefix === "le") return left <= bound;
  return false;
}

function matchesDate(resource: Resource, param: string, raw: string): boolean {
  const parsed = /^(eq|ne|gt|lt|ge|le)?(\d{4}(?:-\d{2}(?:-\d{2})?)?)$/.exec(raw);
  if (!parsed?.[2]) {
    throw new Error("In-memory FHIR search does not implement that date precision.");
  }
  const prefix = parsed[1] ?? "eq";
  const bound = parsed[2];
  return dateStrings(resource, param).some((value) => compareDate(value, prefix, bound));
}

function matchesTokenParam(resource: Resource, param: string, raw: string): boolean {
  const paths = TOKEN_PATHS[param] ?? [];
  return orTokens(raw).some((token) =>
    paths.some((path) => tokenMatches(valueAt(resource, path), token)),
  );
}

function matches(resource: Resource, params: Record<string, string>): boolean {
  for (const [key, raw] of Object.entries(params)) {
    if (key === "_count" || key === "_sort" || key === "_summary") continue;
    if (key === "_id") {
      if (!resource.id || !orTokens(raw).includes(resource.id)) return false;
      continue;
    }
    if (key === "_tag") {
      if (!hasTag(resource, raw)) return false;
      continue;
    }
    if (key === "_tag:not") {
      if (hasTag(resource, raw)) return false;
      continue;
    }
    if (key === "identifier") {
      if (!identifierMatches(resource, raw)) return false;
      continue;
    }
    if (key === "name") {
      if (!nameMatches(resource, raw)) return false;
      continue;
    }
    if (key === "patient" || key === "subject") {
      if (!referenceMatches(resource, raw)) return false;
      continue;
    }
    if (key in DATE_PATHS) {
      if (!matchesDate(resource, key, raw)) return false;
      continue;
    }
    if (key in TOKEN_PATHS) {
      if (!matchesTokenParam(resource, key, raw)) return false;
      continue;
    }
    throw unsupported(key);
  }
  return true;
}

function sortKey(resource: Resource, field: string): string {
  return dateStrings(resource, field).reduce(
    (best, value) => (value > best ? value : best),
    "",
  );
}

export class MemoryFhirClient implements FhirWriteClient {
  private readonly rows = new Map<string, Resource>();

  async search<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<Bundle<ExtractResource<K>>> {
    const query = params ?? {};
    if (query._summary !== undefined && query._summary !== "count") {
      throw unsupported("_summary");
    }
    const matchesForType = [...this.rows.values()].filter(
      (resource) => resource.resourceType === resourceType && matches(resource, query),
    );
    const sortRaw = query._sort;
    if (sortRaw) {
      if (sortRaw.includes(",")) throw unsupported("_sort");
      const descending = sortRaw.startsWith("-");
      const field = (descending ? sortRaw.slice(1) : sortRaw).trim();
      if (!(field in DATE_PATHS)) throw unsupported("_sort");
      matchesForType.sort((left, right) => {
        const compared = sortKey(left, field).localeCompare(sortKey(right, field));
        const directed = descending ? -compared : compared;
        if (directed !== 0) return directed;
        return (left.id ?? "").localeCompare(right.id ?? "");
      });
    }
    let page = matchesForType;
    if (query._count !== undefined) {
      if (!/^\d+$/.test(query._count)) {
        throw new Error(
          "In-memory FHIR search requires _count to be a non-negative integer.",
        );
      }
      page = matchesForType.slice(0, Number(query._count));
    }
    const summary = query._summary === "count";
    return {
      resourceType: "Bundle",
      type: "searchset",
      total: matchesForType.length,
      entry: summary
        ? []
        : page.map((resource) => ({
            resource: clone(resource) as ExtractResource<K>,
            search: { mode: "match" as const },
          })),
    };
  }

  async searchResources<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<ExtractResource<K>[]> {
    const bundle = await this.search(resourceType, params);
    return (bundle.entry ?? [])
      .filter((entry) => !entry.search?.mode || entry.search.mode === "match")
      .map((entry) => entry.resource)
      .filter((resource): resource is ExtractResource<K> => resource !== undefined);
  }

  async createResource<T extends Resource>(resource: T): Promise<T & { id: string }> {
    if (!resource.resourceType) {
      throw new Error("FHIR create requires resourceType.");
    }
    const stored = clone(resource) as T & { id?: string };
    if (stored.id !== undefined && !/^[A-Za-z0-9.-]{1,64}$/.test(stored.id)) {
      throw new Error("FHIR resource id is not valid.");
    }
    if (!stored.id) stored.id = randomUUID();
    const key = `${stored.resourceType}/${stored.id}`;
    if (this.rows.has(key)) {
      throw new Error(`FHIR resource ${stored.resourceType}/${stored.id} already exists.`);
    }
    this.rows.set(key, stored);
    return clone(stored) as T & { id: string };
  }

  async readResource<K extends ResourceType>(
    resourceType: K,
    id: string,
  ): Promise<ExtractResource<K>> {
    const found = this.rows.get(`${resourceType}/${id}`);
    if (!found || found.resourceType !== resourceType) {
      throw new Error(`FHIR resource ${resourceType}/${id} was not found.`);
    }
    return clone(found) as ExtractResource<K>;
  }

  async deleteResource(resourceType: ResourceType, id: string): Promise<void> {
    if (!this.rows.delete(`${resourceType}/${id}`)) {
      throw new Error(`FHIR resource ${resourceType}/${id} was not found.`);
    }
  }
}
