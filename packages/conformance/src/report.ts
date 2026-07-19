export const CONFORMANCE_REPORT_SCHEMA_VERSION = "1";

export const SPEC = {
  title: "Approval-Gated Agent Writes on FHIR",
  version: "0.1",
  url: "https://www.lastehr.com/docs/agent-write-protocol",
} as const;

export type CheckId =
  | "synthetic-target"
  | "capability-gate"
  | "proposal-gate"
  | "decision-shape"
  | "proposal-renders-inputs"
  | "approved-write"
  | "denied-write"
  | "unavailable-write"
  | "cleanup";

/**
 * must — mechanically proves a spec MUST; a failure is nonconformance.
 * partial — proves a weaker property than the spec sentence it cites
 *   (stated in the check detail); passing is evidence, not proof.
 * hygiene — suite mechanics (disposable target, cleanup), not a spec
 *   requirement.
 */
export type CheckLevel = "must" | "partial" | "hygiene";

export type ConformanceCheck = {
  id: CheckId;
  level: CheckLevel;
  label: string;
  status: "pass" | "fail" | "skipped";
  /** Static text only: never interpolated with errors, ids, or endpoints. */
  detail: string;
};

/**
 * Spec requirements a mechanical suite cannot observe from outside; a
 * conformance claim covers these by attestation, never by this report.
 */
export const ATTESTATIONS: readonly string[] = [
  "Tool code builds the FHIR resource from validated, capped inputs; the agent never supplies raw FHIR (spec section 1).",
  "The proposal rendering shows every field that will save, not a summary (spec section 1; the proposal-renders-inputs check proves presence of inputs, not completeness of rendering).",
  "No approval path exists other than an explicit reviewer decision: no timeout-approve, no batch approval (spec section 2; absence is not mechanically provable).",
  "Commit-time additions beyond the rendered fields are limited to mechanical metadata (spec section 3).",
  "Write tools beyond those named in the manifest follow the same gate (the suite exercises only manifest-named tools).",
  "Free text loaded from charts crosses model boundaries inside an untrusted-content delimiter (spec Security considerations).",
  "No write exists on the chart at ANY instant during deliberation: the suite probes at sampled points (twice while pending, once after settling); a write-then-rollback implementation racing those probes violates spec section 1 but can evade sampled detection.",
];

export type ConformanceReport = {
  schemaVersion: typeof CONFORMANCE_REPORT_SCHEMA_VERSION;
  suite: { name: string; version: string };
  spec: typeof SPEC;
  /** Static by design: the report never echoes caller-supplied labels. */
  target: "synthetic-disposable";
  generatedAt: string;
  status: "pass" | "fail";
  checks: ConformanceCheck[];
  attestations: readonly string[];
};
