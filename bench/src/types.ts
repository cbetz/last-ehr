/**
 * Shared records for the write-safety benchmark.
 *
 * Checks read these records and a FHIR snapshot. They do not import the
 * reference MCP server. Tool names that count as writes come from the
 * adapter (`writeToolNames`), so a later adapter can name its own tools.
 */

export type PatientRef = {
  name: string;
  birthDate: string;
};

export type BenchCategory =
  | "approval-gate"
  | "resource-shape"
  | "evidence"
  | "prompt-injection"
  | "patient-match"
  | "decline-final"
  | "stale-evidence"
  | "tool-scope";

export type ReviewDecision = "approve" | "decline" | "cancel" | "mixed";

export type ReviewerPolicy =
  | "approve"
  | "decline"
  | "cancel"
  | "approve-after-cited-change"
  | "batch-mixed"
  | "batch-stale-first";

/** Synthetic chart text planted before the agent runs. Not a real record. */
export type Plant =
  | { kind: "note"; patient: PatientRef; text: string }
  | { kind: "document"; patient: PatientRef; title: string; body: string };

export type Cite =
  | { collection: "observations"; labelIncludes: string }
  | { collection: "conditions"; labelIncludes: string }
  | { collection: "allergies"; labelIncludes: string };

export type ChartSection =
  | "Communication"
  | "DocumentReference"
  | "AllergyIntolerance"
  | "MedicationRequest"
  | "Observation";

/**
 * What the scripted reference agent does. A model agent never sees this.
 * The plans call `@lastehr/mcp` tool names; they are not a second adapter.
 */
export type ScriptedPlan =
  | { do: "stop" }
  | { do: "search-absent"; name: string }
  | { do: "read"; patient: PatientRef; section: ChartSection }
  | { do: "read-document"; patient: PatientRef; titleIncludes: string }
  | { do: "resolve"; patient: PatientRef }
  | { do: "note"; patient: PatientRef; text: string; cite: Cite }
  | {
      do: "note-after-section";
      patient: PatientRef;
      section: ChartSection;
      text: string;
      cite: Cite;
    }
  | {
      do: "observation";
      patient: PatientRef;
      label: string;
      value: number;
      unit: string;
      citeLabelIncludes: string;
    }
  | {
      do: "task";
      patient: PatientRef;
      description: string;
      dueDate?: string;
      cite: Cite;
    }
  | {
      do: "note-and-task";
      patient: PatientRef;
      text: string;
      description: string;
      cite: Cite;
    }
  | {
      do: "supersede";
      patient: PatientRef;
      labelIncludes: string;
      value: number;
      unit: string;
    }
  | {
      do: "batch-note-and-task";
      patient: PatientRef;
      text: string;
      description: string;
      cite: Cite;
    }
  | {
      do: "batch-notes";
      patient: PatientRef;
      first: { text: string; cite: Cite };
      second: { text: string; cite: Cite };
    };

/**
 * Machine checks for one scenario. Counts and patient refs are the task,
 * not a judgement that the write was clinically appropriate.
 */
export type Expectation = {
  writeCalls?: number;
  noWriteCalls?: boolean;
  noRetryAfterDecline?: boolean;
  citations?: boolean;
  forbidsReference?: string;
  writesTarget?: PatientRef;
  communication?: {
    patient: PatientRef;
    textIncludes: string;
    textExcludes?: string;
    count?: number;
  };
  noNewCommunication?: boolean;
  observation?: {
    patient: PatientRef;
    labelIncludes: string;
    value: number;
    unit: string;
    count?: number;
  };
  noNewObservation?: boolean;
  noObservationOn?: PatientRef;
  task?: {
    patient: PatientRef;
    descriptionIncludes: string;
    dueIncludes?: string;
    count?: number;
  };
  noNewTask?: boolean;
  shape?: Array<"Communication" | "Observation" | "Task">;
  allergiesUnchanged?: PatientRef;
  allergyTextPresent?: { patient: PatientRef; includes: string };
  /** Exact marker that must show up in a read-tool result. Not copied into the report. */
  readContains?: string;
  /** Exact marker that must not appear on any resource created during the run. */
  markerNotInNewResources?: string;
  citedChanged?: boolean;
  savedTrue?: number;
  writeToolsHidden?: boolean;
  originalObservation?: { patient: PatientRef; labelIncludes: string; value: number };
  noNewPatientNamed?: PatientRef;
  minReadCalls?: number;
};

export type Scenario = {
  id: string;
  title: string;
  category: BenchCategory;
  instruction: string;
  scripted: ScriptedPlan;
  reviewer: ReviewerPolicy;
  /** Default true. False connects a client that does not declare elicitation. */
  elicitation?: boolean;
  plants?: Plant[];
  expect: Expectation;
};

export type ToolDescriptor = {
  name: string;
  description: string;
  inputSchema: unknown;
};

export type ElicitationRecord = {
  decision: ReviewDecision;
  /** True when the store at prompt-open matched the store at call start, before any harness edit. */
  unchangedBeforeDecision: boolean;
  /**
   * How many proposals this prompt explicitly approved. A single-item
   * prompt leaves it unset and counts as one. A batch prompt counts the
   * items set to approve, not a single flag for the whole batch.
   */
  approvedCount?: number;
};

export type ToolResult = {
  name: string;
  args: Record<string, unknown>;
  isError: boolean;
  text: string;
  json: unknown;
  elicitation?: ElicitationRecord;
};

export type StoredResource = {
  reference: string;
  resourceType: string;
  id: string;
  canonical: string;
  resource: Record<string, unknown>;
};

export type StoreSnapshot = {
  byReference: Map<string, StoredResource>;
};

export type RunRecord = {
  writeToolNames: readonly string[];
  /** Read tools for citation and read-count checks. Defaults to READ_TOOL_NAMES. */
  readToolNames?: readonly string[];
  tools: string[];
  calls: ToolResult[];
  baseline: StoreSnapshot;
  final: StoreSnapshot;
  reviewerError?: string;
};

export type AgentKind = "scripted" | "model" | "probe";

export type CheckResult = {
  id: string;
  status: "pass" | "fail" | "n/a";
  detail: string;
};

export type ScenarioResult = {
  id: string;
  title: string;
  category: BenchCategory;
  status: "pass" | "fail" | "n/a";
  /** Set when the scenario was not run. */
  reason?: string;
  checks: CheckResult[];
};

export const BENCH_CATEGORIES: readonly BenchCategory[] = [
  "approval-gate",
  "resource-shape",
  "evidence",
  "patient-match",
  "prompt-injection",
  "decline-final",
  "stale-evidence",
  "tool-scope",
];

export const READ_TOOL_NAMES = [
  "search_patients",
  "show_patient_info",
  "read_chart_section",
  "read_document",
] as const;

export const NOT_MEASURED = [
  "clinical correctness",
  "whether a requested write was clinically appropriate",
  "regulatory compliance",
  "behavior on real patient data",
] as const;

export const BENCHMARK_ID = "lastehr-write-safety";
export const BENCHMARK_VERSION = "1";
export const REPORT_SCHEMA_VERSION = "2";
