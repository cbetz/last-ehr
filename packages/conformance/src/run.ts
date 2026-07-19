import { randomUUID } from "node:crypto";

import type { Connector, McpConnection } from "./harness.js";
import {
  parseDefaultResult,
  substituteArguments,
  type ConformanceManifest,
  type WriteToolManifest,
} from "./manifest.js";
import type { FhirProbe, FhirResource } from "./probe.js";
import {
  ATTESTATIONS,
  CONFORMANCE_REPORT_SCHEMA_VERSION,
  SPEC,
  type CheckId,
  type CheckLevel,
  type ConformanceCheck,
  type ConformanceReport,
} from "./report.js";

export const CONFORMANCE_TAG_SYSTEM =
  "https://lastehr.com/awp-conformance";

export type RunConformanceOptions = {
  /**
   * Required before the suite creates or deletes resources. This must
   * only be set for a disposable, synthetic FHIR target.
   */
  confirmSyntheticTarget: true;
  connector: Connector;
  probe: FhirProbe;
  manifest: ConformanceManifest;
  suiteVersion?: string;
  now?: () => Date;
  /**
   * Milliseconds to wait before each post-decision persistence sweep, so
   * an async commit racing the probe is more likely to be seen. 0 for
   * in-memory tests; default 500.
   */
  settleMs?: number;
  /**
   * Count should-level (audit) failures toward the overall status. Off by
   * default: the spec's Audit section is SHOULD-level.
   */
  strict?: boolean;
};

function getPath(resource: FhirResource, dotPath: string): unknown {
  return dotPath
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined,
      resource,
    );
}

export async function runConformance(
  options: RunConformanceOptions,
): Promise<ConformanceReport> {
  if (options.confirmSyntheticTarget !== true) {
    throw new Error(
      "The conformance suite requires confirmSyntheticTarget: true before it can create or delete resources.",
    );
  }
  const { connector, probe, manifest } = options;
  const now = options.now ?? (() => new Date());
  const runId = randomUUID();
  const checks: ConformanceCheck[] = [];
  const trackedWrites: Array<{ resourceType: string; id: string }> = [];
  let patientId: string | undefined;
  // Distinct nonce per scenario so a stray commit from one scenario can
  // never satisfy another scenario's match. Kept in a range plausible for
  // capped numeric tool inputs (e.g. an observation value).
  let nonceCounter = 10_000 + Math.floor(Math.random() * 80_000);
  const nextNonce = () => ++nonceCounter;

  const addCheck = (
    id: CheckId,
    level: CheckLevel,
    label: string,
    status: ConformanceCheck["status"],
    detail: string,
  ) => {
    checks.push({ id, level, label, status, detail });
  };

  // The citable REPORT stays scrub-clean (static details only, so backend
  // errors, ids, and endpoints can never reach it), while the operator's
  // own terminal gets the diagnostic — a conformance failure with zero
  // clues is undebuggable.
  const runCheck = async (
    id: CheckId,
    level: CheckLevel,
    label: string,
    detail: string,
    callback: () => Promise<void>,
  ): Promise<boolean> => {
    try {
      await callback();
      addCheck(id, level, label, "pass", detail);
      return true;
    } catch (error) {
      console.error(
        `[awp-conformance] ${id} failed:`,
        error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      );
      addCheck(id, level, label, "fail", detail);
      return false;
    }
  };

  // Persistence sweeps are deliberately UNSCOPED (whole resource type, no
  // patient filter): a non-conforming implementation that commits on
  // denial under the wrong patient — or duplicates a write under another
  // patient — must not escape detection just because a patient-scoped
  // search cannot see it. --confirm-synthetic guarantees a small
  // disposable store, which is what makes the type-level diff sound.
  const searchTypeRows = async (
    tool: WriteToolManifest,
  ): Promise<FhirResource[]> =>
    probe.searchResources(tool.creates, { _count: "500" });

  const snapshotIds = async (tool: WriteToolManifest): Promise<Set<string>> =>
    new Set(
      (await searchTypeRows(tool))
        .map((row) => row.id)
        .filter((id): id is string => Boolean(id)),
    );

  // Sampled-point probing cannot see a write that lands and rolls back
  // between probes; the settle delay narrows that window and the residual
  // race is named in the attestations.
  const settleMs = options.settleMs ?? 500;
  const settle = () =>
    settleMs > 0
      ? new Promise((resolve) => setTimeout(resolve, settleMs))
      : Promise.resolve();

  const newRowsSince = async (
    tool: WriteToolManifest,
    before: Set<string>,
  ): Promise<FhirResource[]> =>
    (await searchTypeRows(tool)).filter(
      (row) => row.id && !before.has(row.id),
    );

  // Rows a failing check discovers still belong to this run; track them
  // so cleanup can collect them and the store stays disposable.
  const trackRows = (tool: WriteToolManifest, rows: FhirResource[]) => {
    for (const row of rows) {
      if (row.id) trackedWrites.push({ resourceType: tool.creates, id: row.id });
    }
  };

  const withConnection = async <T>(
    connect: () => Promise<McpConnection>,
    body: (connection: McpConnection) => Promise<T>,
  ): Promise<T> => {
    const connection = await connect();
    try {
      return await body(connection);
    } finally {
      await connection.close().catch(() => {});
    }
  };

  const callWithArgs = async (
    connection: McpConnection,
    tool: WriteToolManifest,
    nonce: number,
  ) => {
    const { args } = substituteArguments(tool, patientId ?? "", nonce);
    try {
      return await connection.callTool(tool.name, args);
    } catch {
      // A thrown JSON-RPC error is a refusal, which several checks treat
      // as the correct fail-closed outcome; callers decide.
      return { isError: true, text: "" };
    }
  };

  // The committed resources approved-write verified, kept for the
  // should-level audit checks.
  const approvedResources: Array<{
    tool: WriteToolManifest;
    resource: FhirResource;
  }> = [];

  const targetReady = await runCheck(
    "synthetic-target",
    "hygiene",
    "Synthetic disposable target",
    "The suite created its uniquely tagged synthetic patient on the target.",
    async () => {
      const token = runId.replace(/-/g, "").slice(0, 10);
      const patient = await probe.createResource({
        resourceType: "Patient",
        name: [{ family: "AwpConformance", given: [`Probe${token}`] }],
        meta: { tag: [{ system: CONFORMANCE_TAG_SYSTEM, code: runId }] },
      });
      if (!patient.id) throw new Error("no id");
      patientId = patient.id;
    },
  );

  const skip = (id: CheckId, level: CheckLevel, label: string, detail: string) =>
    addCheck(id, level, label, "skipped", detail);

  try {
    if (!targetReady) {
      skip("capability-gate", "must", "Capability gate", "Skipped: no synthetic target.");
      skip("proposal-gate", "must", "Proposal gate", "Skipped: no synthetic target.");
      skip("decision-shape", "must", "Decision shape", "Skipped: no synthetic target.");
      skip("proposal-renders-inputs", "partial", "Proposal renders inputs", "Skipped: no synthetic target.");
      skip("approved-write", "must", "Approved write", "Skipped: no synthetic target.");
      skip("denied-write", "must", "Denied write", "Skipped: no synthetic target.");
      skip("unavailable-write", "must", "Unavailable decision", "Skipped: no synthetic target.");
      skip("audit-aiast", "should", "AIAST security label", "Skipped: no synthetic target.");
      skip("audit-provenance", "should", "Write Provenance", "Skipped: no synthetic target.");
    } else {
      // Spec section 2: hosts that cannot render proposals MUST NOT be
      // offered write capability at all — and a call anyway saves nothing.
      await runCheck(
        "capability-gate",
        "must",
        "Capability gate",
        "Without the elicitation capability, no manifest write tool is listed, and calling one is refused with nothing persisted.",
        async () =>
          withConnection(
            () => connector({ elicitation: false }),
            async (connection) => {
              const names = await connection.listToolNames();
              for (const tool of manifest.writeTools) {
                if (names.includes(tool.name)) throw new Error("listed");
                const before = await snapshotIds(tool);
                const result = await callWithArgs(connection, tool, nextNonce());
                const parsed = parseDefaultResult(result.text);
                if (!result.isError && parsed.saved !== false) {
                  throw new Error("not refused");
                }
                await settle();
                const leaked = await newRowsSince(tool, before);
                if (leaked.length > 0) {
                  trackRows(tool, leaked);
                  throw new Error("persisted");
                }
              }
            },
          ),
      );

      // Spec section 1: an invoked write tool MUST NOT execute; it MUST
      // produce a proposal. Proven by probing DURING the reviewer's
      // deliberation: the proposal exists, the chart has not changed.
      const capturedElicitations: Array<{
        tool: WriteToolManifest;
        nonce: number;
        request: { message: string; requestedSchema: { properties?: Record<string, { type?: string }> } };
      }> = [];
      await runCheck(
        "proposal-gate",
        "must",
        "Proposal gate",
        "Invoking a write tool produced a proposal, and sampled probes during deliberation and after the scripted denial found nothing persisted (see attestations for the sampling boundary).",
        async () => {
          for (const tool of manifest.writeTools) {
            const nonce = nextNonce();
            const before = await snapshotIds(tool);
            let pendingRows = -1;
            await withConnection(
              () =>
                connector({
                  elicitation: true,
                  reviewer: async (request) => {
                    capturedElicitations.push({ tool, nonce, request });
                    // Two sampled probes while the proposal is pending: at
                    // handler entry and again after the settle window, so
                    // an async commit issued alongside the elicitation has
                    // time to become visible before the denial returns.
                    pendingRows = (await newRowsSince(tool, before)).length;
                    await settle();
                    pendingRows = Math.max(
                      pendingRows,
                      (await newRowsSince(tool, before)).length,
                    );
                    return { action: "decline" };
                  },
                }),
              async (connection) => {
                await callWithArgs(connection, tool, nonce);
              },
            );
            if (pendingRows !== 0) throw new Error("no proposal or early write");
            await settle();
            const afterDecline = await newRowsSince(tool, before);
            if (afterDecline.length > 0) {
              trackRows(tool, afterDecline);
              throw new Error("persisted after decline");
            }
          }
        },
      );

      // Spec section 2: the decision exchange requests a decision, never
      // data — every requested property must be boolean-shaped.
      await runCheck(
        "decision-shape",
        "must",
        "Decision shape",
        "Every property the proposal's decision schema requests is boolean-typed; the exchange asks for a decision, never data.",
        async () => {
          const coveredTools = new Set(
            capturedElicitations.map((entry) => entry.tool.name),
          );
          for (const tool of manifest.writeTools) {
            if (!coveredTools.has(tool.name)) throw new Error("uncovered tool");
          }
          for (const { request } of capturedElicitations) {
            const properties = request.requestedSchema?.properties ?? {};
            if (Object.keys(properties).length === 0) throw new Error("empty");
            for (const property of Object.values(properties)) {
              if (property?.type !== "boolean") throw new Error("non-boolean");
            }
          }
        },
      );

      // Spec section 1 (partial): proves each argument VALUE appears in
      // the rendering — presence, not faithful or complete rendering.
      await runCheck(
        "proposal-renders-inputs",
        "partial",
        "Proposal renders inputs",
        "Every scalar argument value appears in the proposal shown to the reviewer (proves presence, not completeness of rendering).",
        async () => {
          // Same coverage guard as decision-shape: with nothing captured
          // for a tool, the loop below would pass vacuously.
          const coveredTools = new Set(
            capturedElicitations.map((entry) => entry.tool.name),
          );
          for (const tool of manifest.writeTools) {
            if (!coveredTools.has(tool.name)) throw new Error("uncovered tool");
          }
          for (const { tool, nonce, request } of capturedElicitations) {
            const { args } = substituteArguments(tool, patientId ?? "", nonce);
            for (const value of Object.values(args)) {
              if (
                (typeof value === "string" || typeof value === "number") &&
                !request.message.includes(String(value))
              ) {
                throw new Error("input not rendered");
              }
            }
          }
        },
      );

      // Spec sections 2+3: only an explicit approval commits, and it
      // commits exactly the proposed values, exactly once, reported back
      // with the server-assigned id.
      await runCheck(
        "approved-write",
        "must",
        "Approved write",
        "An explicit approval committed exactly one new resource of the declared type, containing the proposed values (substring match), referencing the synthetic patient, and the result reported the server-assigned id.",
        async () => {
          for (const tool of manifest.writeTools) {
            const nonce = nextNonce();
            const before = await snapshotIds(tool);
            const result = await withConnection(
              () =>
                connector({
                  elicitation: true,
                  reviewer: async (request) => {
                    const content: Record<string, boolean> = {};
                    for (const key of Object.keys(
                      request.requestedSchema?.properties ?? {},
                    )) {
                      content[key] = true;
                    }
                    return { action: "accept", content };
                  },
                }),
              (connection) => callWithArgs(connection, tool, nonce),
            );
            const created = await newRowsSince(tool, before);
            if (created.length !== 1) throw new Error("not exactly once");
            const resource = created[0];
            trackedWrites.push({
              resourceType: tool.creates,
              id: resource.id as string,
            });
            approvedResources.push({ tool, resource });
            const serialized = JSON.stringify(resource);
            if (!serialized.includes(String(nonce))) throw new Error("nonce missing");
            const { args } = substituteArguments(tool, patientId ?? "", nonce);
            for (const value of Object.values(args)) {
              if (
                (typeof value === "string" || typeof value === "number") &&
                !serialized.includes(String(value))
              ) {
                throw new Error("approved value missing from committed resource");
              }
            }
            if (
              getPath(resource, tool.patientReferencePath) !==
              `Patient/${patientId}`
            ) {
              throw new Error("wrong patient");
            }
            const parsed = parseDefaultResult(result.text);
            if (parsed.saved !== true || parsed.id !== resource.id) {
              throw new Error("result does not report the committed id");
            }
          }
        },
      );

      // Spec section 2: decline, cancel, and an accept whose booleans are
      // false are all denials — nothing persists and the result says so.
      await runCheck(
        "denied-write",
        "must",
        "Denied write",
        "Decline, cancel, and an unapproved accept each persisted nothing, and the result reported no save.",
        async () => {
          const reviewers: Array<Parameters<Connector>[0]["reviewer"]> = [
            async () => ({ action: "decline" }),
            async () => ({ action: "cancel" }),
            async (request) => {
              const content: Record<string, boolean> = {};
              for (const key of Object.keys(
                request.requestedSchema?.properties ?? {},
              )) {
                content[key] = false;
              }
              return { action: "accept", content };
            },
          ];
          for (const tool of manifest.writeTools) {
            for (const reviewer of reviewers) {
              const before = await snapshotIds(tool);
              const result = await withConnection(
                () => connector({ elicitation: true, reviewer }),
                (connection) => callWithArgs(connection, tool, nextNonce()),
              );
              await settle();
              const leaked = await newRowsSince(tool, before);
              if (leaked.length > 0) {
                trackRows(tool, leaked);
                throw new Error("persisted");
              }
              if (parseDefaultResult(result.text).saved !== false) {
                throw new Error("result did not report the non-save");
              }
            }
          }
        },
      );

      // Spec section 2: transport failure during the decision exchange
      // MUST fail closed — nothing written, non-save visible to the agent.
      await runCheck(
        "unavailable-write",
        "must",
        "Unavailable decision",
        "A decision exchange that failed in transit persisted nothing, and the agent-visible outcome was a non-save.",
        async () => {
          for (const tool of manifest.writeTools) {
            const before = await snapshotIds(tool);
            const result = await withConnection(
              () =>
                connector({
                  elicitation: true,
                  reviewer: async () => {
                    throw new Error("scripted transport failure");
                  },
                }),
              (connection) => callWithArgs(connection, tool, nextNonce()),
            );
            await settle();
            const leakedRows = await newRowsSince(tool, before);
            if (leakedRows.length > 0) {
              trackRows(tool, leakedRows);
              throw new Error("persisted");
            }
            const parsed = parseDefaultResult(result.text);
            if (!result.isError && parsed.saved !== false) {
              throw new Error("outcome not a visible non-save");
            }
          }
        },
      );

      // Spec Audit section (SHOULD): approved writes carry the standard
      // AIAST security label so agent writes are distinguishable from
      // human ones with one _security search.
      await runCheck(
        "audit-aiast",
        "should",
        "AIAST security label",
        "Every approved write carries the AIAST label (Artificial Intelligence asserted) in meta.security.",
        async () => {
          if (approvedResources.length === 0) throw new Error("no writes");
          for (const { resource } of approvedResources) {
            const security =
              (resource.meta as
                | { security?: Array<{ system?: string; code?: string }> }
                | undefined)?.security ?? [];
            if (
              !security.some(
                (label) =>
                  label.system ===
                    "http://terminology.hl7.org/CodeSystem/v3-ObservationValue" &&
                  label.code === "AIAST",
              )
            ) {
              throw new Error("missing AIAST");
            }
          }
        },
      );

      // Spec Audit section (SHOULD): a Provenance resource binds each
      // approved write to the agent (author) and the reviewer (verifier).
      await runCheck(
        "audit-provenance",
        "should",
        "Write Provenance",
        "Each approved write is targeted by a Provenance naming an author agent and a verifier agent.",
        async () => {
          if (approvedResources.length === 0) throw new Error("no writes");
          for (const { tool, resource } of approvedResources) {
            const provenances = await probe.searchResources("Provenance", {
              target: `${tool.creates}/${resource.id}`,
              _count: "50",
            });
            const roles = new Set(
              provenances
                .flatMap(
                  (provenance) =>
                    (provenance as {
                      agent?: Array<{
                        type?: { coding?: Array<{ code?: string }> };
                      }>;
                    }).agent ?? [],
                )
                .flatMap((agent) => agent.type?.coding ?? [])
                .map((coding) => coding.code),
            );
            if (!roles.has("author") || !roles.has("verifier")) {
              throw new Error("missing provenance roles");
            }
          }
        },
      );
    }
  } finally {
    await runCheck(
      "cleanup",
      "hygiene",
      "Cleanup",
      "Every resource the suite observed being created was deleted (audit Provenance swept first for referential integrity).",
      async () => {
        for (const written of [...trackedWrites].reverse()) {
          // Implementations may emit audit Provenance targeting the
          // write; sweep it first so referential-integrity servers allow
          // the delete. Best effort: absence of support must not fail
          // cleanup of the write itself.
          try {
            const provenances = await probe.searchResources("Provenance", {
              target: `${written.resourceType}/${written.id}`,
              _count: "50",
            });
            for (const provenance of provenances) {
              const targets = (provenance as {
                target?: Array<{ reference?: string }>;
              }).target ?? [];
              if (
                provenance.id &&
                targets.some(
                  (target) =>
                    target.reference ===
                    `${written.resourceType}/${written.id}`,
                )
              ) {
                await probe.deleteResource("Provenance", provenance.id);
              }
            }
          } catch {
            // Provenance search unsupported on this server; the write
            // delete below is the real assertion.
          }
          await probe.deleteResource(written.resourceType, written.id);
        }
        if (patientId) {
          await probe.deleteResource("Patient", patientId);
        }
      },
    );
  }

  const strict = options.strict ?? false;
  return {
    schemaVersion: CONFORMANCE_REPORT_SCHEMA_VERSION,
    suite: {
      name: "@lastehr/agent-write-conformance",
      version: options.suiteVersion ?? "0.1.0",
    },
    spec: SPEC,
    target: "synthetic-disposable",
    strict,
    generatedAt: now().toISOString(),
    status: checks.every(
      (check) =>
        check.status === "pass" ||
        (!strict && check.level === "should" && check.status === "fail"),
    )
      ? "pass"
      : "fail",
    checks,
    attestations: ATTESTATIONS,
  };
}
