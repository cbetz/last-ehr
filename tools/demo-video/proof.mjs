#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const PHASES = ["baseline", "pending", "approved", "second_pending", "canceled"];
const IDENTIFIER_SYSTEM = "https://lastehr.com/synthetic";
const IDENTIFIER_VALUE = "synthetic-004";
const LOINC_SYSTEM = "http://loinc.org";
const UCUM_SYSTEM = "http://unitsofmeasure.org";
const SECURITY_SYSTEM = "http://terminology.hl7.org/CodeSystem/v3-ObservationValue";
const MAX_PAGES = 250;
const MAX_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 10_000;
const SNAPSHOT_TIMEOUT_MS = 60_000;
const RESOURCE_ID = /^[A-Za-z0-9.-]{1,64}$/;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exec = promisify(execFile);
const timestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value));

class ProofError extends Error {
  constructor(code) {
    super("Synthetic demo proof failed; upstream details withheld.");
    this.code = code;
  }
}

function requireProof(condition, code) {
  if (!condition) throw new ProofError(code);
}

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === "--help") return null;
  requireProof(argv[0] === "snapshot", "arguments");
  const allowed = new Set(["--phase", "--fhir-url", "--output", "--source", "--source-dir"]);
  const args = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    requireProof(allowed.has(key) && !(key in args) && typeof value === "string" && !value.startsWith("--"), "arguments");
    args[key] = value;
  }
  requireProof(allowed.size === Object.keys(args).length && PHASES.includes(args["--phase"]), "arguments");
  requireProof(/^[a-f0-9]{40}$/.test(args["--source"]), "source");
  return { phase: args["--phase"], fhirUrl: args["--fhir-url"], output: path.resolve(args["--output"]), source: args["--source"], sourceDir: path.resolve(args["--source-dir"]) };
}

async function verifySource(options) {
  const run = (args) => exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "-C", options.sourceDir, ...args], {
    timeout: REQUEST_TIMEOUT_MS, maxBuffer: MAX_BYTES,
    // Source inspection needs no FHIR, provider, credential-helper, or Git
    // environment from the caller. Never serialize directory paths or status.
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "C", LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  });
  let head;
  let status;
  try {
    head = (await run(["rev-parse", "--verify", "HEAD"])).stdout.trim();
    status = (await run(["status", "--porcelain", "--untracked-files=normal", "--ignore-submodules=none"])).stdout;
  } catch { throw new ProofError("source_inspection"); }
  requireProof(head === options.source && status === "", "source_not_clean");
  return { head, trackedClean: true, untrackedClean: true, verifiedAt: new Date().toISOString() };
}

function fhirBase(value) {
  let url;
  try { url = new URL(value); } catch { throw new ProofError("fhir_url"); }
  requireProof(
    url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    !url.username && !url.password && !url.search && !url.hash && /^\/fhir\/?$/.test(url.pathname),
    "fhir_url",
  );
  url.pathname = "/fhir";
  return url;
}

function sameIds(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function validIds(value) {
  return Array.isArray(value) && value.length <= MAX_PAGES && value.every((id) => typeof id === "string" && RESOURCE_ID.test(id)) &&
    sameIds(value, [...new Set(value)].sort());
}

function projectApproved(resource, patientId) {
  const coding = resource?.code?.coding?.find((entry) => entry?.system === LOINC_SYSTEM && entry.code === "8867-4");
  const security = resource?.meta?.security?.find((entry) => entry?.system === SECURITY_SYSTEM && entry.code === "AIAST");
  requireProof(
    object(resource) && resource.resourceType === "Observation" && typeof resource.id === "string" && RESOURCE_ID.test(resource.id) &&
    resource.subject?.reference === `Patient/${patientId}` && resource.status === "final" &&
    resource.valueQuantity?.value === 72 && resource.valueQuantity.unit === "bpm" &&
    resource.valueQuantity.system === UCUM_SYSTEM && resource.valueQuantity.code === "/min" && coding && security,
    "approved_fields",
  );
  return {
    resourceType: resource.resourceType,
    id: resource.id,
    status: resource.status,
    subject: { reference: resource.subject.reference },
    valueQuantity: { value: resource.valueQuantity.value, unit: resource.valueQuantity.unit, system: resource.valueQuantity.system, code: resource.valueQuantity.code },
    code: { coding: [{ system: coding.system, code: coding.code }] },
    meta: { security: [{ system: security.system, code: security.code }] },
  };
}

function collectionUrl(base, resourceType, filter) {
  const url = new URL(`${base.href}/${resourceType}`);
  for (const [key, value] of Object.entries(filter)) url.searchParams.set(key, value);
  url.searchParams.set("_count", "1");
  url.searchParams.set("_total", "accurate");
  return url;
}

// HAPI's next link uses /fhir?_getpages=... rather than /fhir/Observation.
// Only this bounded search continuation or the original scoped collection is
// permitted; arbitrary server-supplied paths and filters are refused.
function validatedPage(value, base, resourceType, filter) {
  let url;
  try { url = new URL(value, `${base.href}/`); } catch { throw new ProofError("pagination_url"); }
  requireProof(url.origin === base.origin && url.protocol === "http:" && !url.username && !url.password && !url.hash, "pagination_origin");
  const query = url.searchParams;
  requireProof([...query.keys()].every((key) => query.getAll(key).length === 1) && query.get("_count") === "1", "pagination_query");
  if (url.pathname === "/fhir" || url.pathname === "/fhir/") {
    requireProof(
      [...query.keys()].every((key) => ["_getpages", "_getpagesoffset", "_count", "_pretty", "_bundletype"].includes(key)) &&
      /^[A-Za-z0-9._-]{1,128}$/.test(query.get("_getpages") ?? "") &&
      /^\d{1,6}$/.test(query.get("_getpagesoffset") ?? "") &&
      Number(query.get("_getpagesoffset")) <= MAX_PAGES && query.get("_bundletype") === "searchset" &&
      (!query.has("_pretty") || ["true", "false"].includes(query.get("_pretty"))),
      "pagination_query",
    );
  } else {
    requireProof(url.pathname === `/fhir/${resourceType}`, "pagination_path");
    const keys = [...Object.keys(filter), "_count", "_total", "_offset"];
    requireProof(
      [...query.keys()].every((key) => keys.includes(key)) &&
      Object.entries(filter).every(([key, expected]) => query.get(key) === expected) &&
      query.get("_total") === "accurate" &&
      (!query.has("_offset") || (/^\d{1,6}$/.test(query.get("_offset")) && Number(query.get("_offset")) <= MAX_PAGES)),
      "pagination_query",
    );
  }
  return url;
}

async function readJson(url, deadline) {
  const remaining = deadline - Date.now();
  requireProof(remaining > 0, "snapshot_timeout");
  const response = await fetch(url, {
    method: "GET", credentials: "omit", redirect: "manual",
    headers: { accept: "application/fhir+json" },
    signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
  });
  if (response.status !== 200 || !response.body || Number(response.headers.get("content-length")) > MAX_BYTES) {
    void response.body?.cancel().catch(() => {});
    throw new ProofError("fhir_response");
  }
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks = [];
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      requireProof(bytes <= MAX_BYTES, "fhir_response_size");
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function readCollection(base, resourceType, filter, deadline) {
  let next = collectionUrl(base, resourceType, filter);
  const visited = new Set();
  const resources = [];
  const ids = new Set();
  let pageCount = 0;
  let exactTotal;
  while (next) {
    const url = validatedPage(next.href, base, resourceType, filter);
    requireProof(!visited.has(url.href) && pageCount < MAX_PAGES, "pagination_bound");
    visited.add(url.href);
    const bundle = await readJson(url, deadline);
    requireProof(object(bundle) && bundle.resourceType === "Bundle" && bundle.type === "searchset" &&
      (bundle.entry === undefined || Array.isArray(bundle.entry)) && (bundle.link === undefined || Array.isArray(bundle.link)), "fhir_bundle");
    if (bundle.total !== undefined) {
      requireProof(Number.isSafeInteger(bundle.total) && bundle.total >= 0 && bundle.total <= MAX_PAGES &&
        (exactTotal === undefined || exactTotal === bundle.total), "pagination_total");
      exactTotal = bundle.total;
    }
    const entries = bundle.entry ?? [];
    requireProof(entries.length <= 1, "fhir_page_count");
    for (const entry of entries) {
      const resource = entry?.resource;
      requireProof(object(resource) && resource.resourceType === resourceType && typeof resource.id === "string" && RESOURCE_ID.test(resource.id) && !ids.has(resource.id) &&
        (entry.search?.mode === undefined || entry.search.mode === "match"), "fhir_resource");
      if (resourceType === "Patient") {
        requireProof(Array.isArray(resource.identifier) && resource.identifier.some((identifier) => identifier?.system === IDENTIFIER_SYSTEM && identifier.value === IDENTIFIER_VALUE), "synthetic_patient");
      } else {
        requireProof(resource.subject?.reference === `Patient/${filter.patient}`, "observation_subject");
      }
      ids.add(resource.id);
      resources.push(resource);
    }
    pageCount += 1;
    const nextLinks = (bundle.link ?? []).filter((link) => link?.relation === "next");
    requireProof(nextLinks.length <= 1 && (!nextLinks.length || typeof nextLinks[0].url === "string"), "pagination_link");
    requireProof(exactTotal === undefined || (resources.length <= exactTotal && (!nextLinks.length || resources.length < exactTotal)), "pagination_total");
    next = nextLinks.length ? validatedPage(nextLinks[0].url, base, resourceType, filter) : null;
  }
  requireProof(exactTotal !== undefined && resources.length === exactTotal, "pagination_total");
  return { resources, pageCount, exactTotal };
}

function comparison(phase, ids, snapshots) {
  const comparedWith = phase === "baseline" ? null : ["pending", "approved"].includes(phase) ? "baseline" : "approved";
  const previousIds = comparedWith ? snapshots[comparedWith].observationIds : ids;
  const before = new Set(previousIds);
  const after = new Set(ids);
  const addedIds = ids.filter((id) => !before.has(id));
  const removedIds = previousIds.filter((id) => !after.has(id));
  requireProof(removedIds.length === 0 && addedIds.length === (phase === "approved" ? 1 : 0), "observation_comparison");
  return { comparedWith, addedIds, removedIds };
}

async function existingReport(options, base) {
  let value;
  try {
    const info = await stat(options.output);
    requireProof(info.isFile() && info.size <= MAX_BYTES, "report_size");
    value = JSON.parse(await readFile(options.output, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      requireProof(options.phase === "baseline", "phase_order");
      return null;
    }
    throw error;
  }
  requireProof(object(value) && value.schemaVersion === 1 && value.source?.commit === options.source &&
    value.source.provenance?.head === options.source && value.source.provenance.trackedClean === true && value.source.provenance.untrackedClean === true &&
    timestamp(value.source.provenance.verifiedAt) && value.fhirBaseUrl === base.href &&
    value.syntheticPatient?.identifierSystem === IDENTIFIER_SYSTEM && value.syntheticPatient.identifierValue === IDENTIFIER_VALUE &&
    typeof value.syntheticPatient.id === "string" && RESOURCE_ID.test(value.syntheticPatient.id) && object(value.snapshots) &&
    timestamp(value.startedAt), "report_invalid");
  const phaseIndex = PHASES.indexOf(options.phase);
  requireProof(Object.keys(value.snapshots).length === phaseIndex && PHASES.slice(0, phaseIndex).every((phase) => phase in value.snapshots), "phase_order");
  const snapshots = {};
  for (const phase of PHASES.slice(0, phaseIndex)) {
    const saved = value.snapshots[phase];
    requireProof(object(saved) && saved.phase === phase && saved.status === "pass" && timestamp(saved.capturedAt) && timestamp(saved.sourceVerifiedAt) &&
      validIds(saved.observationIds) && saved.observationCount === saved.observationIds.length &&
      saved.patientExactTotal === 1 && saved.observationExactTotal === saved.observationIds.length &&
      Number.isInteger(saved.patientPageCount) && saved.patientPageCount >= 1 && saved.patientPageCount <= MAX_PAGES &&
      Number.isInteger(saved.observationPageCount) && saved.observationPageCount >= 1 && saved.observationPageCount <= MAX_PAGES,
      "report_snapshot");
    const expected = comparison(phase, saved.observationIds, snapshots);
    requireProof(saved.comparedWith === expected.comparedWith && validIds(saved.addedIds) && sameIds(saved.addedIds, expected.addedIds) &&
      validIds(saved.removedIds) && sameIds(saved.removedIds, expected.removedIds), "report_comparison");
    let approvedObservation = null;
    if (PHASES.indexOf(phase) >= PHASES.indexOf("approved")) {
      approvedObservation = projectApproved(saved.approvedObservation, value.syntheticPatient.id);
      const approvedId = phase === "approved" ? expected.addedIds[0] : snapshots.approved.approvedObservation.id;
      requireProof(approvedObservation.id === approvedId && saved.observationIds.includes(approvedId), "report_approved");
    } else requireProof(saved.approvedObservation === null, "report_approved");
    snapshots[phase] = {
      phase, capturedAt: saved.capturedAt, sourceVerifiedAt: saved.sourceVerifiedAt, status: "pass",
      query: `GET /fhir/Observation?patient=${encodeURIComponent(value.syntheticPatient.id)}&_count=1&_total=accurate`,
      patientPageCount: saved.patientPageCount, observationPageCount: saved.observationPageCount,
      patientExactTotal: saved.patientExactTotal, observationExactTotal: saved.observationExactTotal,
      observationCount: saved.observationIds.length, observationIds: saved.observationIds,
      ...expected, approvedObservation,
    };
  }
  if (value.video !== undefined) requireProof(object(value.video) && /^[a-f0-9]{64}$/.test(value.video.sha256), "video_hash");
  return {
    startedAt: value.startedAt, patientId: value.syntheticPatient.id, snapshots,
    ...(value.video ? { video: { sha256: value.video.sha256 } } : {}),
  };
}

async function saveReport(filename, report) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await rename(temporary, filename);
  } finally { await rm(temporary, { force: true }).catch(() => {}); }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options) {
    console.log("Usage: node tools/demo-video/proof.mjs snapshot --phase baseline|pending|approved|second_pending|canceled --fhir-url http://127.0.0.1:8080/fhir --output artifacts/demo-capture/proof.json --source <40-character-commit> --source-dir <clean-capture-checkout>");
    return;
  }
  const base = fhirBase(options.fhirUrl);
  await verifySource(options);
  const previous = await existingReport(options, base);
  const deadline = Date.now() + SNAPSHOT_TIMEOUT_MS;
  const patients = await readCollection(base, "Patient", { identifier: `${IDENTIFIER_SYSTEM}|${IDENTIFIER_VALUE}` }, deadline);
  requireProof(patients.resources.length === 1, "patient_count");
  const patientId = patients.resources[0].id;
  requireProof(!previous || patientId === previous.patientId, "patient_changed");
  const observations = await readCollection(base, "Observation", { patient: patientId }, deadline);
  const observationIds = observations.resources.map((resource) => resource.id).sort();
  const snapshots = previous?.snapshots ?? {};
  const compared = comparison(options.phase, observationIds, snapshots);
  let approvedObservation = null;
  if (PHASES.indexOf(options.phase) >= PHASES.indexOf("approved")) {
    const approvedId = options.phase === "approved" ? compared.addedIds[0] : snapshots.approved.approvedObservation.id;
    approvedObservation = projectApproved(observations.resources.find((resource) => resource.id === approvedId), patientId);
  }
  const capturedAt = new Date().toISOString();
  const provenance = await verifySource(options);
  snapshots[options.phase] = {
    phase: options.phase, capturedAt, sourceVerifiedAt: provenance.verifiedAt, status: "pass",
    query: `GET /fhir/Observation?patient=${encodeURIComponent(patientId)}&_count=1&_total=accurate`,
    patientPageCount: patients.pageCount, observationPageCount: observations.pageCount,
    patientExactTotal: patients.exactTotal, observationExactTotal: observations.exactTotal,
    observationCount: observationIds.length, observationIds, ...compared, approvedObservation,
  };
  await saveReport(options.output, {
    schemaVersion: 1, source: { commit: options.source, provenance }, fhirBaseUrl: base.href,
    syntheticPatient: { id: patientId, identifierSystem: IDENTIFIER_SYSTEM, identifierValue: IDENTIFIER_VALUE },
    startedAt: previous?.startedAt ?? capturedAt, updatedAt: capturedAt,
    status: options.phase === "canceled" ? "passed" : "in_progress", snapshots,
    ...(previous?.video ? { video: previous.video } : {}),
  });
  console.log(`demo-proof phase=${options.phase} status=pass count=${observationIds.length}`);
}

main().catch((error) => {
  const code = error instanceof ProofError ? error.code : "operation_failed";
  console.error(`demo-proof status=fail code=${code}`);
  process.exitCode = 1;
});
