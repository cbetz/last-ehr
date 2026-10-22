import type { AccessPolicy, Observation, Patient } from "@medplum/fhirtypes";
import { randomBytes } from "node:crypto";

import type { FixturePrincipal, MedplumFixture, SyntheticIdentity } from "./types";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const FIXTURE_SYSTEM = "https://lastehr.com/remote-mcp-fixture";

type BootstrapOptions = {
  baseUrl: string;
  superadminClientId: string;
  superadminClientSecret: string;
  userInfoUrl: string;
  writer: SyntheticIdentity;
  reader: SyntheticIdentity;
  runId: string;
  signal?: AbortSignal;
};

type ConfigOptions = Pick<BootstrapOptions, "baseUrl" | "superadminClientId" | "superadminClientSecret"> & {
  postgresPassword: string;
  signingKey?: string;
};

type FixtureStage =
  | "medplum_fixture_configuration" | "medplum_fixture_resource"
  | "medplum_bootstrap_auth" | "medplum_bootstrap_project"
  | "medplum_writer_policy" | "medplum_reader_policy"
  | "medplum_fixture_patient" | "medplum_fixture_observation"
  | "medplum_exchange_client" | "medplum_writer_membership" | "medplum_reader_membership";

export class FixtureError extends Error {
  constructor(message: string, readonly code: FixtureStage = "medplum_fixture_configuration") {
    super(message);
    this.name = "MedplumFixtureError";
  }
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function localBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FixtureError("The Medplum fixture requires a loopback HTTP(S) base URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname) ||
    url.username || url.password || url.search || url.hash || url.pathname !== "/"
  ) {
    throw new FixtureError("The Medplum fixture requires a loopback HTTP(S) base URL without credentials, path, query, or fragment.");
  }
  return url;
}

function publicUserInfoUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FixtureError("The fixture UserInfo endpoint must be a public HTTPS URL.");
  }
  if (
    url.protocol !== "https:" || LOOPBACK_HOSTS.has(url.hostname) ||
    url.username || url.password || url.search || url.hash
  ) {
    throw new FixtureError("The fixture UserInfo endpoint must be a public HTTPS URL without credentials, query, or fragment.");
  }
  // Medplum's unmodified safeFetch performs the authoritative DNS/IP check.
  return url.href;
}

/** Configuration for a fresh, disposable Medplum 5.1.35 container. */
export function createMedplumConfig(options: ConfigOptions) {
  const baseUrl = localBaseUrl(options.baseUrl).href;
  return {
    port: 8103,
    baseUrl,
    appBaseUrl: baseUrl,
    storageBaseUrl: new URL("storage/", baseUrl).href,
    binaryStorage: "file:/tmp/remote-mcp-binary/",
    database: {
      host: "postgres", port: 5432, dbname: "medplum", username: "medplum",
      password: options.postgresPassword,
      ssl: false,
    },
    redis: { host: "redis", port: 6379 },
    supportEmail: "remote-mcp-fixture@example.invalid",
    emailProvider: "none",
    registerEnabled: false,
    allowUnsafeOutbound: false,
    logLevel: "ERROR",
    logRequests: false,
    logAuditEvents: false,
    defaultSuperAdminEmail: "remote-mcp-bootstrap@example.invalid",
    defaultSuperAdminPassword: randomBytes(32).toString("base64url"),
    defaultSuperAdminClientId: options.superadminClientId,
    defaultSuperAdminClientSecret: options.superadminClientSecret,
    ...(options.signingKey ? {
      signingKeyId: "remote-mcp-fixture-storage",
      signingKey: options.signingKey,
    } : {}),
  };
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new FixtureError("The Medplum fixture request timed out."));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function resourceId(value: unknown, resourceType: string, projectId?: string): string {
  if (
    !object(value) || value.resourceType !== resourceType ||
    typeof value.id !== "string" || !/^[A-Za-z0-9.-]{1,64}$/.test(value.id) ||
    (projectId && (!object(value.meta) || value.meta.project !== projectId))
  ) {
    throw new FixtureError("Medplum returned an unexpected fixture resource or project association.", "medplum_fixture_resource");
  }
  return value.id;
}

/**
 * Provision only the local disposable stack. The returned admin credential is
 * for setup and independent FHIR verification; never give it to the MCP server.
 */
export async function bootstrapMedplum(options: BootstrapOptions): Promise<MedplumFixture> {
  if (options.signal?.aborted) throw new FixtureError("Medplum fixture setup was cancelled.");
  const base = localBaseUrl(options.baseUrl);
  const userInfoUrl = publicUserInfoUrl(options.userInfoUrl);
  if (!/^[A-Za-z0-9-]{1,80}$/.test(options.runId) ||
    !options.writer.subject || !options.reader.subject || options.writer.subject === options.reader.subject) {
    throw new FixtureError("The fixture requires a run identifier and two distinct synthetic subjects.");
  }

  async function request(path: string, init: RequestInit, stage: FixtureStage): Promise<Record<string, unknown>> {
    if (options.signal?.aborted) throw new FixtureError("Medplum fixture setup was cancelled.", stage);
    const abort = new AbortController();
    const onParentAbort = () => abort.abort();
    options.signal?.addEventListener("abort", onParentAbort, { once: true });
    const timeout = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await untilAborted(fetch(new URL(path, base), {
        ...init, redirect: "manual", signal: abort.signal,
      }), abort.signal);
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new FixtureError(`Medplum fixture setup failed (HTTP ${response.status}); backend diagnostics were withheld.`);
      }
      if (!response.body) throw new FixtureError("Medplum returned no fixture response body.");
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      let bytes = 0;
      for (;;) {
        const { done, value } = await untilAborted(reader.read(), abort.signal);
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw new FixtureError("Medplum fixture response exceeded the size limit.");
        text += decoder.decode(value, { stream: true });
      }
      const parsed: unknown = JSON.parse(text + decoder.decode());
      if (!object(parsed) || parsed.resourceType === "OperationOutcome") {
        throw new FixtureError("Medplum returned an unexpected fixture response; backend diagnostics were withheld.");
      }
      return parsed;
    } catch (error) {
      void reader?.cancel().catch(() => {});
      if (options.signal?.aborted) throw new FixtureError("Medplum fixture setup was cancelled.", stage);
      if (error instanceof FixtureError) throw new FixtureError(error.message, stage);
      throw new FixtureError("Medplum fixture setup failed; backend diagnostics were withheld.", stage);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onParentAbort);
      abort.abort();
    }
  }

  const token = await request("oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials", client_id: options.superadminClientId,
      client_secret: options.superadminClientSecret,
    }).toString(),
  }, "medplum_bootstrap_auth");
  if (typeof token.access_token !== "string" || !token.access_token) {
    throw new FixtureError("Medplum fixture authentication returned no access token.", "medplum_bootstrap_auth");
  }
  const adminAccessToken = token.access_token;
  const post = (path: string, body: unknown, stage: FixtureStage) => request(path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${adminAccessToken}`,
      "content-type": "application/fhir+json", "x-medplum": "extended",
    },
    body: JSON.stringify(body),
  }, stage);
  const projectId = resourceId(await post("fhir/R4/Project/$init", {
    resourceType: "Parameters",
    parameter: [{ name: "name", valueString: `Remote MCP synthetic ${options.runId}` }],
  }, "medplum_bootstrap_project"), "Project");
  const tag = [{ system: FIXTURE_SYSTEM, code: options.runId }];
  const meta = { project: projectId, tag };
  const create = async (resource: AccessPolicy | Patient | Observation, stage: FixtureStage) => {
    const result = await post(`fhir/R4/${resource.resourceType}`, { ...resource, meta }, stage);
    return resourceId(result, resource.resourceType, projectId);
  };

  const writerPolicyId = await create({
    resourceType: "AccessPolicy", name: "Remote MCP synthetic writer",
    resource: [
      { resourceType: "Patient", interaction: ["read", "search"] },
      { resourceType: "Observation", interaction: ["read", "search"] },
      { resourceType: "Communication", interaction: ["create", "read", "search"] },
    ],
  }, "medplum_writer_policy");
  const readerPolicyId = await create({
    resourceType: "AccessPolicy", name: "Remote MCP synthetic Patient-only reader",
    resource: [{ resourceType: "Patient", interaction: ["read", "search"] }],
  }, "medplum_reader_policy");
  const patientId = await create({
    resourceType: "Patient", active: true,
    identifier: [{ system: FIXTURE_SYSTEM, value: `patient-${options.runId}` }],
    name: [{ given: ["Remote"], family: "MCP Fixture" }],
    birthDate: "1990-01-01",
  }, "medplum_fixture_patient");
  const observationId = await create({
    resourceType: "Observation", status: "final",
    code: { coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }] },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: "2026-01-01T00:00:00Z",
    valueQuantity: { value: 72, unit: "bpm", system: "http://unitsofmeasure.org", code: "/min" },
  }, "medplum_fixture_observation");
  const exchangeClientId = resourceId(await post(`admin/projects/${projectId}/client`, {
    name: "Remote MCP synthetic token exchange",
    identityProvider: { userInfoUrl, useSubject: true },
  }, "medplum_exchange_client"), "ClientApplication", projectId);

  async function invite(identity: SyntheticIdentity, policyId: string, stage: FixtureStage): Promise<FixturePrincipal> {
    const membership = await post(`admin/projects/${projectId}/invite`, {
      resourceType: "Practitioner", firstName: identity.firstName, lastName: identity.lastName,
      externalId: identity.subject, sendEmail: false, admin: false,
      accessPolicy: { reference: `AccessPolicy/${policyId}` },
    }, stage);
    const membershipId = resourceId(membership, "ProjectMembership", projectId);
    const profile = membership.profile;
    if (
      membership.externalId !== identity.subject ||
      !object(membership.project) || membership.project.reference !== `Project/${projectId}` ||
      !object(profile) || typeof profile.reference !== "string" ||
      !/^Practitioner\/[A-Za-z0-9.-]{1,64}$/.test(profile.reference)
    ) {
      throw new FixtureError("Medplum returned an unexpected synthetic subject or membership association.", stage);
    }
    return { subject: identity.subject, profileReference: profile.reference, membershipId };
  }
  const writer = await invite(options.writer, writerPolicyId, "medplum_writer_membership");
  const reader = await invite(options.reader, readerPolicyId, "medplum_reader_membership");
  return {
    baseUrl: base.href, projectId, patientId, observationId, exchangeClientId,
    adminAccessToken, writer, reader,
  };
}
