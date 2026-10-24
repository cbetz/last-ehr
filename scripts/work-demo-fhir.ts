import { WORK_JOB_IDENTIFIER, type FollowUpTask, type WorkCommitter, type WorkTaskRecord } from "../lib/work/service";
import type { WorkAssistantContext } from "../lib/work/assistant";

export const WORK_DEMO_FHIR_URL = "http://127.0.0.1:8080/fhir";
export const WORK_DEMO_TENANT_ID = "synthetic-work-lab";
export const WORK_DEMO_FIXTURE_SYSTEM = "https://lastehr.com/work-lab/fixture";
export const WORK_DEMO_JOB_SYSTEM = WORK_JOB_IDENTIFIER;
export const WORK_DEMO_PATIENT_MARKER = "synthetic-patient-v1";
export const WORK_DEMO_RESULT_MARKER = "synthetic-result-v1";

type JsonObject = Record<string, unknown>;
type Fetch = typeof globalThis.fetch;

export type WorkDemoFixture = {
  patientId: string;
  source: { reference: string; versionId: string };
  patientLabel: string;
  resultLabel: string;
};

type ErrorCode =
  | "UNSAFE_FHIR_URL"
  | "FHIR_UNAVAILABLE"
  | "FHIR_RESPONSE_INVALID"
  | "FHIR_CAPABILITY_REQUIRED"
  | "FHIR_FIXTURE_MISMATCH"
  | "FHIR_SCOPE_INVALID"
  | "FHIR_SOURCE_CHANGED"
  | "FHIR_TASK_INVALID"
  | "FHIR_TASK_DUPLICATE"
  | "FHIR_COMMIT_UNKNOWN";

const messages: Record<ErrorCode, string> = {
  UNSAFE_FHIR_URL: "The work lab requires an explicit numeric loopback HTTP /fhir URL.",
  FHIR_UNAVAILABLE: "The local synthetic FHIR service is unavailable.",
  FHIR_RESPONSE_INVALID: "The local synthetic FHIR service returned an invalid response.",
  FHIR_CAPABILITY_REQUIRED: "The local FHIR service must explicitly support conditional creation.",
  FHIR_FIXTURE_MISMATCH: "The work lab synthetic fixture could not be verified.",
  FHIR_SCOPE_INVALID: "The request is outside the synthetic work lab scope.",
  FHIR_SOURCE_CHANGED: "The reviewed synthetic source is no longer current.",
  FHIR_TASK_INVALID: "The proposed Task is outside the synthetic work lab contract.",
  FHIR_TASK_DUPLICATE: "More than one Task matches the work identifier; reconciliation is required.",
  FHIR_COMMIT_UNKNOWN: "The FHIR write outcome is unknown; reconcile before retrying.",
};

/** Static diagnostics intentionally exclude URLs, response bodies and upstream errors. */
export class WorkDemoFhirError extends Error {
  constructor(readonly code: ErrorCode) {
    super(messages[code]);
    this.name = "WorkDemoFhirError";
  }
}

function fail(code: ErrorCode): never {
  throw new WorkDemoFhirError(code);
}

function object(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function resourceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9.-]{1,64}$/.test(value);
}

/** Do not resolve hostnames, follow redirects, inherit credentials, or load .env files. */
export function validateWorkDemoFhirUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return fail("UNSAFE_FHIR_URL");
  }
  // Check the spelling as well as URL.hostname: WHATWG URL canonicalizes unusual
  // integer, octal and hexadecimal IP spellings to 127.0.0.1.
  if (
    !/^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[1-9][0-9]{0,4})?\/fhir\/?$/.test(value) ||
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    parsed.username || parsed.password || parsed.search || parsed.hash ||
    !["/fhir", "/fhir/"].includes(parsed.pathname)
  ) fail("UNSAFE_FHIR_URL");
  return parsed.toString().replace(/\/$/, "");
}

function identifierQuery(system: string, value: string): string {
  return new URLSearchParams({ identifier: `${system}|${value}`, _count: "2", _total: "accurate" }).toString();
}

function fixtureIdentifier(value: string) {
  return [{ system: WORK_DEMO_FIXTURE_SYSTEM, value }];
}

const patientFixture = {
  resourceType: "Patient",
  identifier: fixtureIdentifier(WORK_DEMO_PATIENT_MARKER),
  active: true,
  name: [{ use: "official", family: "Worklab", given: ["Alex", "Synthetic"] }],
  gender: "unknown",
  birthDate: "2000-01-01",
};

function resultFixture(patientId: string) {
  return {
    resourceType: "Observation",
    identifier: fixtureIdentifier(WORK_DEMO_RESULT_MARKER),
    status: "final",
    code: {
      coding: [{ system: "http://loinc.org", code: "4548-4" }],
      text: "Demonstration HbA1c result (synthetic)",
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: "2026-01-01T12:00:00Z",
    valueQuantity: { value: 6.4, unit: "%", system: "http://unitsofmeasure.org", code: "%" },
  };
}

function assertFixture(resource: JsonObject, expected: JsonObject): void {
  if (!resourceId(resource.id) || !object(resource.meta) || !resourceId(resource.meta.versionId)) {
    fail("FHIR_FIXTURE_MISMATCH");
  }
  // A copied marker on an unrelated chart is insufficient. Only the exact
  // invented fixture content is accepted; there is no update or delete path.
  const content = Object.fromEntries(Object.entries(resource).filter(([key]) => key !== "id" && key !== "meta"));
  if (canonical(content) !== canonical(expected)) fail("FHIR_FIXTURE_MISMATCH");
}

function assertTenant(tenantId: string): void {
  if (tenantId !== WORK_DEMO_TENANT_ID) fail("FHIR_SCOPE_INVALID");
}

function assertJobId(jobId: string): void {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(jobId)) fail("FHIR_SCOPE_INVALID");
}

export type WorkDemoFhirAdapter = WorkCommitter & {
  getFixture(): Promise<WorkDemoFixture>;
  readContext(): Promise<WorkAssistantContext>;
};

export function createWorkDemoFhirAdapter({
  baseUrl = WORK_DEMO_FHIR_URL,
  fetch: fetcher = globalThis.fetch,
  timeoutMs = 5_000,
}: {
  baseUrl?: string;
  fetch?: Fetch;
  timeoutMs?: number;
} = {}): WorkDemoFhirAdapter {
  const base = validateWorkDemoFhirUrl(baseUrl);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) fail("FHIR_SCOPE_INVALID");

  async function request(path: string, init: RequestInit = {}): Promise<JsonObject | undefined> {
    try {
      const response = await fetcher(`${base}/${path}`, {
        ...init,
        headers: {
          Accept: "application/fhir+json",
          ...(init.body ? { "Content-Type": "application/fhir+json" } : {}),
          ...init.headers,
        },
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 404 && (!init.method || init.method === "GET")) return undefined;
      if (!response.ok) fail("FHIR_UNAVAILABLE");
      const reader = response.body?.getReader();
      if (!reader) fail("FHIR_RESPONSE_INVALID");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        // HAPI's full R4 CapabilityStatement is about 2 MB; resources and
        // bounded searches have a much smaller independent ceiling.
        if (bytes > (path === "metadata" ? 4 * 1024 * 1024 : 128 * 1024)) {
          await reader.cancel();
          fail("FHIR_RESPONSE_INVALID");
        }
        chunks.push(chunk.value);
      }
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!object(parsed)) fail("FHIR_RESPONSE_INVALID");
      return parsed;
    } catch (error) {
      if (error instanceof WorkDemoFhirError) throw error;
      fail("FHIR_UNAVAILABLE");
    }
  }

  async function requireConditionalCreate(types: string[]): Promise<void> {
    const metadata = await request("metadata");
    const rest = Array.isArray(metadata?.rest) ? metadata.rest : [];
    const resources = rest.flatMap((entry) => object(entry) && entry.mode === "server" && Array.isArray(entry.resource) ? entry.resource : []);
    if (metadata?.resourceType !== "CapabilityStatement" || !types.every((type) => resources.some((entry) => object(entry) && entry.type === type && entry.conditionalCreate === true))) {
      fail("FHIR_CAPABILITY_REQUIRED");
    }
  }

  async function search(type: string, system: string, value: string): Promise<JsonObject[]> {
    const bundle = await request(`${type}?${identifierQuery(system, value)}`);
    if (bundle?.resourceType !== "Bundle" || bundle.type !== "searchset") fail("FHIR_RESPONSE_INVALID");
    if (bundle.entry !== undefined && !Array.isArray(bundle.entry)) fail("FHIR_RESPONSE_INVALID");
    const entries = (bundle.entry ?? []) as unknown[];
    const resources = entries.map((entry) => {
      if (!object(entry) || !object(entry.resource) || entry.resource.resourceType !== type) fail("FHIR_RESPONSE_INVALID");
      return entry.resource;
    });
    const hasNext = Array.isArray(bundle.link) && bundle.link.some((link) => object(link) && link.relation === "next");
    if (hasNext || (typeof bundle.total === "number" && bundle.total > resources.length)) fail(type === "Task" ? "FHIR_TASK_DUPLICATE" : "FHIR_FIXTURE_MISMATCH");
    return resources;
  }

  async function getOrCreateFixture(type: string, marker: string, expected: JsonObject): Promise<JsonObject> {
    let matches = await search(type, WORK_DEMO_FIXTURE_SYSTEM, marker);
    if (matches.length === 0) {
      await request(type, {
        method: "POST",
        headers: { "If-None-Exist": new URLSearchParams({ identifier: `${WORK_DEMO_FIXTURE_SYSTEM}|${marker}` }).toString(), Prefer: "return=representation" },
        body: JSON.stringify(expected),
      });
      matches = await search(type, WORK_DEMO_FIXTURE_SYSTEM, marker);
    }
    if (matches.length !== 1) fail("FHIR_FIXTURE_MISMATCH");
    assertFixture(matches[0], expected);
    return matches[0];
  }

  async function readFixture(): Promise<{ patient: JsonObject; result: JsonObject }> {
    const patients = await search("Patient", WORK_DEMO_FIXTURE_SYSTEM, WORK_DEMO_PATIENT_MARKER);
    if (patients.length !== 1) fail("FHIR_FIXTURE_MISMATCH");
    assertFixture(patients[0], patientFixture);
    const patient = await request(`Patient/${patients[0].id}`);
    if (!patient || patient.id !== patients[0].id) fail("FHIR_FIXTURE_MISMATCH");
    assertFixture(patient, patientFixture);
    const results = await search("Observation", WORK_DEMO_FIXTURE_SYSTEM, WORK_DEMO_RESULT_MARKER);
    if (results.length !== 1) fail("FHIR_FIXTURE_MISMATCH");
    assertFixture(results[0], resultFixture(patient.id as string));
    const result = await request(`Observation/${results[0].id}`);
    if (!result || result.id !== results[0].id) fail("FHIR_FIXTURE_MISMATCH");
    assertFixture(result, resultFixture(patient.id as string));
    return { patient, result };
  }

  function taskRecord(resource: JsonObject): WorkTaskRecord {
    if (resource.resourceType !== "Task" || !resourceId(resource.id)) fail("FHIR_RESPONSE_INVALID");
    return {
      id: resource.id,
      resource,
      ...(object(resource.meta) && typeof resource.meta.versionId === "string" ? { versionId: resource.meta.versionId } : {}),
    };
  }

  const adapter: WorkDemoFhirAdapter = {
    async getFixture() {
      await requireConditionalCreate(["Patient", "Observation", "Task"]);
      const patient = await getOrCreateFixture("Patient", WORK_DEMO_PATIENT_MARKER, patientFixture);
      const result = await getOrCreateFixture("Observation", WORK_DEMO_RESULT_MARKER, resultFixture(patient.id as string));
      return {
        patientId: patient.id as string,
        source: { reference: `Observation/${result.id}`, versionId: (result.meta as JsonObject).versionId as string },
        patientLabel: "Alex Synthetic Worklab — invented patient",
        resultLabel: "Demonstration HbA1c: 6.4% — synthetic result dated January 1, 2026",
      };
    },
    async readContext() {
      // Project only the approved synthetic fields after fresh authoritative
      // reads verify both resources. Marker search results alone are not chart
      // context, and identifiers, metadata and arbitrary FHIR text stay local.
      const { patient, result } = await readFixture();
      const name = (patient.name as Array<{ given: string[]; family: string }>)[0];
      const quantity = result.valueQuantity as { value: number; unit: string };
      return {
        patient: {
          reference: `Patient/${patient.id}`,
          label: [...name.given, name.family].join(" "),
          dateOfBirth: patient.birthDate as string,
        },
        observation: {
          reference: `Observation/${result.id}`,
          versionId: (result.meta as JsonObject).versionId as string,
          label: (result.code as { text: string }).text,
          value: quantity.value,
          unit: quantity.unit,
          effectiveDateTime: result.effectiveDateTime as string,
        },
      };
    },
    async validateContext({ tenantId, patientId, source }) {
      assertTenant(tenantId);
      const { patient, result } = await readFixture();
      return patient.id === patientId && source.reference === `Observation/${result.id}` && source.versionId === (result.meta as JsonObject).versionId;
    },
    async findByJobId({ tenantId, jobId }) {
      assertTenant(tenantId);
      assertJobId(jobId);
      return (await search("Task", WORK_DEMO_JOB_SYSTEM, jobId)).map(taskRecord);
    },
    async conditionalCreate({ tenantId, jobId, proposal }: { tenantId: string; jobId: string; proposal: FollowUpTask }) {
      assertTenant(tenantId);
      assertJobId(jobId);
      await requireConditionalCreate(["Task"]);
      const { patient, result } = await readFixture();
      const proposed = proposal as unknown as JsonObject;
      const expected = {
        resourceType: "Task",
        status: "requested",
        intent: "order",
        identifier: [{ system: WORK_DEMO_JOB_SYSTEM, value: jobId }],
        for: { reference: `Patient/${patient.id}` },
        focus: { reference: `Observation/${result.id}` },
        input: [{ type: { text: "Reviewed source version" }, valueString: `Observation/${result.id}/_history/${(result.meta as JsonObject).versionId}` }],
        description: proposed.description,
        ...(proposed.restriction === undefined ? {} : { restriction: proposed.restriction }),
      };
      if (typeof proposed.description !== "string" || proposed.description.trim().length < 1 || proposed.description.length > 2_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(proposed.description) || canonical(proposed) !== canonical(expected)) fail("FHIR_TASK_INVALID");
      if (proposed.restriction !== undefined) {
        const restriction = proposed.restriction;
        if (!object(restriction) || !object(restriction.period) || typeof restriction.period.end !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(restriction.period.end) || !Number.isFinite(Date.parse(restriction.period.end)) || new Date(restriction.period.end).toISOString().slice(0, 10) !== restriction.period.end || canonical(restriction) !== canonical({ period: { end: restriction.period.end } })) fail("FHIR_TASK_INVALID");
      }
      try {
        const resource = await request("Task", {
          method: "POST",
          headers: { "If-None-Exist": new URLSearchParams({ identifier: `${WORK_DEMO_JOB_SYSTEM}|${jobId}` }).toString(), Prefer: "return=representation" },
          body: JSON.stringify(proposal),
        });
        if (!resource) fail("FHIR_COMMIT_UNKNOWN");
        const stored = Object.fromEntries(Object.entries(resource).filter(([key]) => key !== "id" && key !== "meta"));
        if (canonical(stored) !== canonical(proposal)) fail("FHIR_COMMIT_UNKNOWN");
        return taskRecord(resource);
      } catch {
        // Once POST starts, timeout, invalid response and HTTP error may all
        // conceal a successful write. The service must reconcile by job id.
        fail("FHIR_COMMIT_UNKNOWN");
      }
    },
  };
  return adapter;
}
