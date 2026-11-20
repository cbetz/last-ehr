/**
 * FHIR R4 REST access for the benchmark harness.
 *
 * Snapshot, plant, mutate, and reseed go straight to the FHIR server the
 * MCP process is pointed at. They do not go through the MCP server.
 * Synthetic fixtures only.
 */

import {
  bindSubject,
  SYNTHETIC_IDENTIFIER_SYSTEM,
  syntheticChartResources,
} from "../../packages/mcp/src/synthetic-chart.js";
import { syntheticPatients } from "../../packages/mcp/src/synthetic-patients.js";
import { asRecord, canonicalJson, stringOf } from "./json.js";
import type { PatientRef, Plant, StoredResource, StoreSnapshot } from "./types.js";

const SNAPSHOT_TYPES = [
  "Patient",
  "Observation",
  "Communication",
  "Task",
  "AllergyIntolerance",
  "Condition",
  "MedicationRequest",
  "DocumentReference",
  "Immunization",
  "Provenance",
  "Encounter",
  "CarePlan",
  "Goal",
] as const;

const CHILD_TYPES = [
  "Communication",
  "Observation",
  "Condition",
  "AllergyIntolerance",
  "MedicationRequest",
  "Immunization",
  "Task",
  "DocumentReference",
  "Encounter",
  "CarePlan",
  "Goal",
] as const;

const PLANTED_TAG = {
  system: "https://lastehr.com/write-safety-bench",
  code: "planted",
} as const;

const JSON_HEADERS = {
  accept: "application/fhir+json",
  "content-type": "application/fhir+json",
};

function bump(resource: Record<string, unknown>): void {
  const quantity = asRecord(resource.valueQuantity);
  if (quantity && typeof quantity.value === "number") {
    quantity.value += 1;
    return;
  }
  const payload = Array.isArray(resource.payload) ? resource.payload : [];
  const first = asRecord(payload[0]);
  if (first && typeof first.contentString === "string") {
    first.contentString = `${first.contentString}\n[stale]`;
    return;
  }
  if (typeof resource.description === "string") {
    resource.description = `${resource.description}\n[stale]`;
    return;
  }
  const meta = asRecord(resource.meta) ?? {};
  const tag = Array.isArray(meta.tag) ? [...meta.tag] : [];
  tag.push({ system: PLANTED_TAG.system, code: "stale" });
  resource.meta = { ...meta, tag };
}

function nameTokens(resource: Record<string, unknown>): Set<string> {
  const tokens = new Set<string>();
  const names = Array.isArray(resource.name) ? resource.name : [];
  for (const entry of names) {
    const human = asRecord(entry);
    if (!human) continue;
    if (typeof human.family === "string") tokens.add(human.family.toLowerCase());
    if (Array.isArray(human.given)) {
      for (const given of human.given) {
        if (typeof given === "string") tokens.add(given.toLowerCase());
      }
    }
  }
  return tokens;
}

export class FhirRestStore {
  constructor(private readonly baseUrl: string) {}

  async snapshot(): Promise<StoreSnapshot> {
    const byReference = new Map<string, StoredResource>();
    for (const resourceType of SNAPSHOT_TYPES) {
      const rows = await this.search(resourceType, { _count: "200" });
      for (const row of rows) {
        const id = stringOf(row.id);
        if (!id) continue;
        const reference = `${resourceType}/${id}`;
        byReference.set(reference, {
          reference,
          resourceType,
          id,
          canonical: canonicalJson(row),
          resource: row,
        });
      }
    }
    return { byReference };
  }

  async findPatient(patient: PatientRef): Promise<string> {
    const family = patient.name.trim().split(/\s+/).filter(Boolean).at(-1) ?? patient.name;
    const rows = await this.search("Patient", { name: family, _count: "50" });
    const want = patient.name.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = rows.filter((row) => {
      if (stringOf(row.birthDate) !== patient.birthDate) return false;
      const tokens = nameTokens(row);
      return want.every((part) => tokens.has(part));
    });
    if (matches.length !== 1 || !stringOf(matches[0]?.id)) {
      throw new Error("bench plant did not match exactly one patient");
    }
    return stringOf(matches[0]?.id);
  }

  async plant(plants: readonly Plant[]): Promise<void> {
    for (const plant of plants) {
      const patientId = await this.findPatient(plant.patient);
      if (plant.kind === "note") {
        await this.create({
          resourceType: "Communication",
          status: "completed",
          subject: { reference: `Patient/${patientId}` },
          sent: "2026-04-01T00:00:00.000Z",
          payload: [{ contentString: plant.text }],
          meta: { tag: [PLANTED_TAG] },
        });
        continue;
      }
      const body = Buffer.from(plant.body, "utf8");
      await this.create({
        resourceType: "DocumentReference",
        status: "current",
        description: plant.title,
        type: { text: plant.title },
        subject: { reference: `Patient/${patientId}` },
        date: "2026-04-01T00:00:00Z",
        content: [
          {
            attachment: {
              contentType: "text/plain",
              title: plant.title,
              data: body.toString("base64"),
              size: body.byteLength,
            },
          },
        ],
        meta: { tag: [PLANTED_TAG] },
      });
    }
  }

  async mutate(reference: string): Promise<void> {
    const slash = reference.indexOf("/");
    if (slash <= 0) throw new Error("bench mutate reference is not ResourceType/id");
    const resourceType = reference.slice(0, slash);
    const id = reference.slice(slash + 1);
    const current = await this.read(resourceType, id);
    const next = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
    bump(next);
    await this.update(next);
  }

  /** Replace the synthetic fixture charts so each scenario starts clean. */
  async reseed(): Promise<void> {
    for (const fixture of syntheticPatients) {
      await this.wipeKey(fixture.key);
      const chart = syntheticChartResources(fixture);
      const patient = await this.create(chart.patient as unknown as Record<string, unknown>);
      const patientId = stringOf(patient.id);
      if (!patientId) throw new Error("FHIR did not assign a patient id");
      for (const related of chart.related) {
        const bound = bindSubject(related, patientId);
        await this.create(bound as unknown as Record<string, unknown>);
      }
    }
  }

  private async wipeKey(key: string): Promise<void> {
    const token = `${SYNTHETIC_IDENTIFIER_SYSTEM}|${key}`;
    const existing = await this.search("Patient", { identifier: token, _count: "20" });
    for (const patient of existing) {
      const id = stringOf(patient.id);
      if (!id) continue;
      const childRefs: string[] = [];
      for (const type of CHILD_TYPES) {
        const param: Record<string, string> = { _count: "200" };
        if (type === "Communication") param.subject = `Patient/${id}`;
        else param.patient = id;
        const children = await this.search(type, param);
        for (const child of children) {
          const childId = stringOf(child.id);
          if (!childId) continue;
          childRefs.push(`${type}/${childId}`);
        }
      }
      if (childRefs.length > 0) {
        const provenances = await this.search("Provenance", { target: childRefs.join(","), _count: "200" });
        const wipe = new Set(childRefs);
        for (const provenance of provenances) {
          const targets = Array.isArray(provenance.target) ? provenance.target : [];
          const hits = targets.some((target) => {
            const reference = stringOf(asRecord(target)?.reference);
            return wipe.has(reference);
          });
          const provenanceId = stringOf(provenance.id);
          if (hits && provenanceId) await this.remove("Provenance", provenanceId);
        }
        for (const reference of childRefs) {
          const slash = reference.indexOf("/");
          await this.remove(reference.slice(0, slash), reference.slice(slash + 1));
        }
      }
      await this.remove("Patient", id);
    }
  }

  private async search(resourceType: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
    const query = new URLSearchParams(params);
    const rows: Record<string, unknown>[] = [];
    let url: string | undefined = `${this.baseUrl}/${resourceType}?${query.toString()}`;
    for (let page = 0; url && page < 20; page += 1) {
      const body = await this.send("GET", url);
      if (body.resourceType === "OperationOutcome") {
        throw new Error(`FHIR search ${resourceType} failed`);
      }
      const entries = Array.isArray(body.entry) ? body.entry : [];
      for (const entry of entries) {
        const resource = asRecord(asRecord(entry)?.resource);
        if (resource) rows.push(resource);
      }
      const links = Array.isArray(body.link) ? body.link : [];
      const next = links
        .map((link) => asRecord(link))
        .find((link) => link?.relation === "next" && typeof link.url === "string");
      const nextUrl = typeof next?.url === "string" ? next.url : undefined;
      url = nextUrl && nextUrl.startsWith(this.baseUrl) ? nextUrl : undefined;
    }
    return rows;
  }

  private async read(resourceType: string, id: string): Promise<Record<string, unknown>> {
    const body = await this.send("GET", `${this.baseUrl}/${resourceType}/${encodeURIComponent(id)}`);
    if (body.resourceType !== resourceType) throw new Error(`FHIR read ${resourceType} failed`);
    return body;
  }

  private async create(resource: Record<string, unknown>): Promise<Record<string, unknown>> {
    const type = stringOf(resource.resourceType);
    if (!type) throw new Error("FHIR create requires resourceType");
    const body = await this.send("POST", `${this.baseUrl}/${type}`, resource);
    if (body.resourceType === "OperationOutcome" || !stringOf(body.id)) {
      throw new Error(`FHIR create ${type} failed`);
    }
    return body;
  }

  private async update(resource: Record<string, unknown>): Promise<void> {
    const type = stringOf(resource.resourceType);
    const id = stringOf(resource.id);
    if (!type || !id) throw new Error("FHIR update requires resourceType and id");
    const body = await this.send("PUT", `${this.baseUrl}/${type}/${encodeURIComponent(id)}`, resource);
    if (body.resourceType === "OperationOutcome") throw new Error(`FHIR update ${type} failed`);
  }

  private async remove(resourceType: string, id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${resourceType}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { accept: "application/fhir+json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      throw new Error(`FHIR delete ${resourceType} failed (${response.status})`);
    }
  }

  private async send(method: string, url: string, resource?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method,
      headers: JSON_HEADERS,
      ...(resource ? { body: JSON.stringify(resource) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok && response.status !== 201 && response.status !== 200) {
      const type = stringOf(resource?.resourceType) || new URL(url).pathname.split("/").filter(Boolean).at(-1) || "resource";
      throw new Error(`FHIR ${method} ${type} failed (${response.status})`);
    }
    const text = await response.text();
    if (!text) return {};
    const parsed = asRecord(JSON.parse(text) as unknown);
    if (!parsed) throw new Error(`FHIR ${method} did not return a resource`);
    return parsed;
  }
}
