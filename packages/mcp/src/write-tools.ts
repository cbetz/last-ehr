import type { Communication, Observation, Resource, Task } from "@medplum/fhirtypes";
import { z } from "zod";

import type { ApprovalRequest, RequestApproval } from "./approval.js";
import type { FhirReadClient, McpReadTool } from "./read-tools.js";

// Proposal-shaped writes: the same write actions as the web demo
// (Communication note, Observation vital), with matching input caps,
// paused on a human approval before anything executes. The tool builds the
// EXACT resource it would create, renders those fields for the approval,
// and commits only on an explicit approve — a denial saves nothing and says
// so. Every write is tagged so operators can find agent-written records.

export interface FhirWriteClient extends FhirReadClient {
  createResource<T extends Resource>(resource: T): Promise<T & { id: string }>;
}

/** Tag every approved MCP write for discoverability and audit queries. */
export const MCP_WRITE_TAG = {
  system: "https://lastehr.com/mcp",
  code: "approved-proposal",
} as const;

/**
 * Standard first-level AI-transparency label (HL7 AI Transparency on FHIR
 * IG): agent-written resources are marked "Artificial Intelligence
 * asserted" in meta.security.
 */
export const AIAST_LABEL = {
  system: "http://terminology.hl7.org/CodeSystem/v3-ObservationValue",
  code: "AIAST",
  display: "Artificial Intelligence asserted",
} as const;

const PROVENANCE_PARTICIPANT_TYPE =
  "http://terminology.hl7.org/CodeSystem/provenance-participant-type";

export type WriteProposalContext = {
  toolName: string;
  resourceType: string;
  patientId: string;
};

export type WritePolicyDecision =
  | {
      deny: true;
      /**
       * Static, operator-authored text only. The reason enters model
       * context, so interpolating patient or chart data would turn policy
       * denials into a probing oracle for facts the agent cannot read.
       */
      reason?: string;
    }
  | { deny: false };

/**
 * Deny-only write policy: a host-side tightening layer over the approval
 * gate. It can block a proposal (checked before the reviewer is asked,
 * re-checked before commit); it can never approve one.
 */
export type WritePolicy = (
  proposal: WriteProposalContext,
) => WritePolicyDecision | Promise<WritePolicyDecision>;

export type WriteToolOptions = {
  /**
   * Emit a Provenance resource per approved write (author = the agent,
   * verifier = the approving human), per the AI Transparency IG pattern.
   * Non-blocking: an emission failure is reported on stderr and never
   * fails a write the reviewer already approved.
   */
  emitProvenance?: boolean;
  /** Deny-only dynamic policy; affirmative-permit, fail-closed. */
  policy?: WritePolicy;
  /**
   * Statically disabled tools, unregistered entirely (never listed, never
   * callable) per the protocol's capability-gating rule. Validated
   * upstream in loadMcpConfig.
   */
  disabledTools?: readonly string[];
};

// Mirrors lib/ai/tools.ts input caps (note ≤1000, label ≤120, value within
// ±100000, unit ≤20); patientId is additionally capped at 64 characters
// here, stricter than the web tool.
const addNoteSchema = z.object({
  patientId: z.string().min(1).max(64).describe("The patient resource id."),
  text: z
    .string()
    .min(1)
    .max(1000)
    .describe("The note text to add to the chart."),
});

// The regex alone admits 2026-02-31; round-trip through UTC Date parts so
// an impossible date is rejected at proposal time, not by (or worse, past)
// the FHIR server after the reviewer approved it.
function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const createTaskSchema = z.object({
  patientId: z.string().min(1).max(64).describe("The patient resource id."),
  description: z
    .string()
    .min(1)
    .max(500)
    .describe("What needs to happen, e.g. Call about lab results."),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealCalendarDate, "Not a real calendar date.")
    .optional()
    .describe("Optional due date, YYYY-MM-DD."),
});

const recordObservationSchema = z.object({
  patientId: z.string().min(1).max(64).describe("The patient resource id."),
  label: z
    .string()
    .min(1)
    .max(120)
    .describe("What was measured, e.g. Heart rate."),
  value: z
    .number()
    .finite()
    .gte(-100_000)
    .lte(100_000)
    .describe("The numeric value."),
  unit: z.string().min(1).max(20).describe("The unit, e.g. bpm."),
});

const DENIED_RESULT = {
  saved: false,
  outcome:
    "The human reviewer did not approve this write; nothing was saved to the chart.",
};

const UNAVAILABLE_RESULT = {
  saved: false,
  outcome:
    "The approval prompt could not be presented to a human reviewer; nothing was saved to the chart.",
};

// Distinct from DENIED_RESULT: a policy denial is configuration, and must
// never be attributed to a human reviewer (no reviewer was asked).
const policyDeniedResult = (reason?: string) => ({
  saved: false,
  outcome: reason
    ? `This write is blocked by deployment policy. ${reason} Nothing was saved to the chart.`
    : "This write is blocked by deployment policy; nothing was saved to the chart.",
});

export type McpWriteTool = Omit<McpReadTool, "name"> & {
  name: "add_note" | "record_observation" | "create_task";
  /** Marks the tool as a proposal-shaped write for annotations/docs. */
  proposesWrite: true;
};

export const WRITE_TOOL_NAMES = [
  "add_note",
  "record_observation",
  "create_task",
] as const;

/**
 * The one place runtime config becomes write-tool options, exported so
 * the threading is unit-testable (a dropped field here would silently
 * disable a documented flag while every direct-options test still passes).
 */
export function writeToolOptionsFromConfig(config: {
  writeProvenance: boolean;
  disabledWriteTools: string[];
}): WriteToolOptions {
  return {
    emitProvenance: config.writeProvenance,
    disabledTools: config.disabledWriteTools,
  };
}

export function createWriteTools(
  client: FhirWriteClient,
  requestApproval: RequestApproval,
  options: WriteToolOptions = {},
): McpWriteTool[] {
  // Same loud rejection as the env path: a typo'd name in a tightening
  // control must not silently disable nothing. Embedders calling this API
  // directly get the same guarantee loadMcpConfig gives the env.
  const unknownDisables = (options.disabledTools ?? []).filter(
    (name) => !(WRITE_TOOL_NAMES as readonly string[]).includes(name),
  );
  if (unknownDisables.length > 0) {
    throw new Error(
      `Unknown write tool name(s) in disabledTools: ` +
        `${unknownDisables.join(", ")}. Valid names: ${WRITE_TOOL_NAMES.join(", ")}.`,
    );
  }

  const decide = (request: ApprovalRequest) => requestApproval(request);

  // Affirmative-permit: only an explicit deny:false allows. A throwing or
  // malformed policy denies — a tightening layer fails closed, never open.
  const checkWritePolicy = async (
    proposal: WriteProposalContext,
  ): Promise<WritePolicyDecision> => {
    if (!options.policy) return { deny: false };
    try {
      const decision = await options.policy(proposal);
      if (decision && decision.deny === false) return { deny: false };
      return {
        deny: true,
        ...(decision && decision.deny === true &&
        typeof decision.reason === "string"
          ? { reason: decision.reason }
          : {}),
      };
    } catch {
      return { deny: true };
    }
  };

  const emitWriteProvenance = async (
    resourceType: string,
    id: string,
  ): Promise<void> => {
    if (!options.emitProvenance) return;
    try {
      await client.createResource({
        resourceType: "Provenance",
        target: [{ reference: `${resourceType}/${id}` }],
        recorded: new Date().toISOString(),
        agent: [
          {
            type: {
              coding: [
                { system: PROVENANCE_PARTICIPANT_TYPE, code: "author" },
              ],
            },
            who: { display: "Last EHR MCP agent (model-proposed)" },
          },
          {
            type: {
              coding: [
                { system: PROVENANCE_PARTICIPANT_TYPE, code: "verifier" },
              ],
            },
            who: { display: "Human reviewer (elicitation approval)" },
          },
        ],
        meta: { tag: [MCP_WRITE_TAG] },
      });
    } catch (error) {
      // stderr only; stdout is reserved for JSON-RPC.
      console.error(
        "Write-provenance emission failed:",
        error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      );
    }
  };

  const disabled = new Set(options.disabledTools ?? []);

  const tools: McpWriteTool[] = [
    {
      name: "add_note",
      proposesWrite: true,
      description:
        "Propose adding a free-text note to a patient's chart. The human operator reviews the exact note in an approval prompt; nothing is saved unless they approve.",
      inputSchema: addNoteSchema,
      async execute(input: unknown) {
        const { patientId, text } = addNoteSchema.parse(input);
        const proposal = {
          toolName: "add_note",
          resourceType: "Communication",
          patientId,
        };
        // Policy runs before elicitation: a reviewer is never asked to
        // approve a write that cannot commit.
        const policyBefore = await checkWritePolicy(proposal);
        if (policyBefore.deny) return policyDeniedResult(policyBefore.reason);
        const decision = await decide({
          title: "Add this note to the chart?",
          // Free text is JSON-quoted so an embedded newline cannot forge a
          // summary line the reviewer misreads as a separate field.
          summary: [
            `Patient: Patient/${patientId}`,
            `Resource: Communication`,
            `Note: ${JSON.stringify(text)}`,
          ].join("\n"),
        });
        if (decision !== "approved") {
          return decision === "denied" ? DENIED_RESULT : UNAVAILABLE_RESULT;
        }
        // Deny-only re-check at commit time: closes the window where
        // policy tightened while the reviewer deliberated.
        const policyAtCommit = await checkWritePolicy(proposal);
        if (policyAtCommit.deny) {
          return policyDeniedResult(policyAtCommit.reason);
        }
        // Built AFTER the approval so the timestamp is the moment of the
        // approved save, matching the web demo; every field the human saw
        // comes from the same parsed values.
        const resource: Communication = {
          resourceType: "Communication",
          status: "completed",
          subject: { reference: `Patient/${patientId}` },
          sent: new Date().toISOString(),
          payload: [{ contentString: text }],
          meta: { tag: [MCP_WRITE_TAG], security: [AIAST_LABEL] },
        };
        const created = await client.createResource(resource);
        await emitWriteProvenance("Communication", created.id);
        return { saved: true, resourceType: "Communication", id: created.id };
      },
    },
    {
      name: "record_observation",
      proposesWrite: true,
      description:
        "Propose recording a vital sign or lab value on a patient's chart. The human operator reviews the exact values in an approval prompt; nothing is saved unless they approve.",
      inputSchema: recordObservationSchema,
      async execute(input: unknown) {
        const { patientId, label, value, unit } =
          recordObservationSchema.parse(input);
        const proposal = {
          toolName: "record_observation",
          resourceType: "Observation",
          patientId,
        };
        const policyBefore = await checkWritePolicy(proposal);
        if (policyBefore.deny) return policyDeniedResult(policyBefore.reason);
        const decision = await decide({
          title: "Record this observation?",
          summary: [
            `Patient: Patient/${patientId}`,
            `Resource: Observation`,
            `Label: ${JSON.stringify(label)}`,
            `Value: ${value} ${JSON.stringify(unit)}`,
          ].join("\n"),
        });
        if (decision !== "approved") {
          return decision === "denied" ? DENIED_RESULT : UNAVAILABLE_RESULT;
        }
        const policyAtCommit = await checkWritePolicy(proposal);
        if (policyAtCommit.deny) {
          return policyDeniedResult(policyAtCommit.reason);
        }
        // Built AFTER the approval; see the note on add_note above.
        const resource: Observation = {
          resourceType: "Observation",
          status: "final",
          code: { text: label },
          subject: { reference: `Patient/${patientId}` },
          effectiveDateTime: new Date().toISOString(),
          valueQuantity: {
            value,
            unit,
            system: "http://unitsofmeasure.org",
            code: unit,
          },
          meta: { tag: [MCP_WRITE_TAG], security: [AIAST_LABEL] },
        };
        const created = await client.createResource(resource);
        await emitWriteProvenance("Observation", created.id);
        return { saved: true, resourceType: "Observation", id: created.id };
      },
    },
    {
      name: "create_task",
      proposesWrite: true,
      description:
        "Propose creating a follow-up task on a patient's chart (what needs to happen, optionally by when). The human operator reviews the exact task in an approval prompt; nothing is saved unless they approve.",
      inputSchema: createTaskSchema,
      async execute(input: unknown) {
        const { patientId, description, dueDate } =
          createTaskSchema.parse(input);
        const proposal = {
          toolName: "create_task",
          resourceType: "Task",
          patientId,
        };
        const policyBefore = await checkWritePolicy(proposal);
        if (policyBefore.deny) return policyDeniedResult(policyBefore.reason);
        const decision = await decide({
          title: "Create this task?",
          summary: [
            `Patient: Patient/${patientId}`,
            `Resource: Task`,
            `Task: ${JSON.stringify(description)}`,
            // The exact stored value, so the reviewer sees the end-of-day
            // UTC normalization rather than discovering it on the chart.
            ...(dueDate ? [`Due: ${dueDate} (saves as ${dueDate}T23:59:59Z)`] : []),
          ].join("\n"),
        });
        if (decision !== "approved") {
          return decision === "denied" ? DENIED_RESULT : UNAVAILABLE_RESULT;
        }
        const policyAtCommit = await checkWritePolicy(proposal);
        if (policyAtCommit.deny) {
          return policyDeniedResult(policyAtCommit.reason);
        }
        // Built AFTER the approval; see the note on add_note above.
        const resource: Task = {
          resourceType: "Task",
          status: "requested",
          intent: "order",
          description,
          for: { reference: `Patient/${patientId}` },
          authoredOn: new Date().toISOString(),
          ...(dueDate
            ? { restriction: { period: { end: `${dueDate}T23:59:59Z` } } }
            : {}),
          meta: { tag: [MCP_WRITE_TAG], security: [AIAST_LABEL] },
        };
        const created = await client.createResource(resource);
        await emitWriteProvenance("Task", created.id);
        return { saved: true, resourceType: "Task", id: created.id };
      },
    },
  ];
  // Statically disabled tools are unregistered — never listed, never
  // callable (a call falls into the server's Unknown-tool branch) — rather
  // than listed-but-denied, which would invite proposals that can never
  // commit. Dynamic per-call decisions belong in `policy`.
  return tools.filter((tool) => !disabled.has(tool.name));
}
