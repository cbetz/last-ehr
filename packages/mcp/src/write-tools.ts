import type {
  Communication,
  ExtractResource,
  Observation,
  Resource,
  ResourceType,
  Task,
} from "@medplum/fhirtypes";
import { z } from "zod";

import type { ApprovalRequest, RequestApproval } from "./approval.js";
import type { FhirReadClient, McpReadTool } from "./read-tools.js";
import { diffSentVsPersisted } from "./read-back.js";
import {
  applyVendorProfile,
  EPIC_VENDOR_PROFILE,
  ORACLE_VENDOR_PROFILE,
  vendorBlocksTool,
  VendorWriteError,
  type VendorProfile,
} from "./sandbox-profile.js";
import {
  codeObservation,
  OBSERVATION_REPLACES_EXTENSION,
  UCUM_SYSTEM,
} from "./vitals.js";

// Proposal-shaped writes: the same write actions as the web demo
// (Communication note, Observation vital), with matching input caps,
// paused on a human approval before anything executes. The tool builds the
// EXACT resource it would create, renders those fields for the approval,
// and commits only on an explicit approve — a denial saves nothing and says
// so. Every write is tagged so operators can find agent-written records.

export interface FhirWriteClient extends FhirReadClient {
  createResource<T extends Resource>(resource: T): Promise<T & { id: string }>;
  readResource?<K extends ResourceType>(
    resourceType: K,
    id: string,
  ): Promise<ExtractResource<K>>;
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
  /**
   * Epic or Oracle profile. Shapes an Observation before the approval
   * prompt and refuses the other write tools. Unset for Medplum, HAPI,
   * and LASTEHR_BACKEND=smart.
   */
  vendor?: VendorProfile;
  encounter?: string;
  performer?: string;
  /**
   * Keep meta.tag on an Oracle Observation. Off matches the proven fixture.
   * Set from LASTEHR_INCLUDE_META_TAG.
   */
  includeMetaTag?: boolean;
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

const supersedingObservationSchema = z.object({
  patientId: z.string().min(1).max(64).describe("The patient resource id."),
  supersedes: z
    .string()
    .min(1)
    .max(64)
    .describe(
      "Resource id of the earlier observation this one supersedes, from a prior read.",
    ),
  value: z
    .number()
    .finite()
    .gte(-100_000)
    .lte(100_000)
    .describe("The corrected numeric value."),
  unit: z.string().min(1).max(20).describe("The unit, e.g. kg."),
});

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
  encounter: z
    .string()
    .min(1)
    .max(160)
    .optional()
    .describe(
      "Encounter id or Encounter/{id}. Required on the Epic sandbox. Omit when LASTEHR_ENCOUNTER is set.",
    ),
  performer: z
    .string()
    .min(1)
    .max(160)
    .optional()
    .describe(
      "Practitioner id or Practitioner/{id}. Required on the Oracle Health sandbox; filed as legal authenticator.",
    ),
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
  name:
    | "add_note"
    | "record_observation"
    | "record_superseding_observation"
    | "create_task";
  /** Marks the tool as a proposal-shaped write for annotations/docs. */
  proposesWrite: true;
};

export const WRITE_TOOL_NAMES = [
  "add_note",
  "record_observation",
  "record_superseding_observation",
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
  sandbox?: {
    profile?: "epic" | "oracle";
    encounter?: string;
    performer?: string;
    includeMetaTag?: boolean;
  };
}): WriteToolOptions {
  const profile =
    config.sandbox?.profile === "epic"
      ? EPIC_VENDOR_PROFILE
      : config.sandbox?.profile === "oracle"
        ? ORACLE_VENDOR_PROFILE
        : undefined;
  return {
    emitProvenance: config.writeProvenance,
    disabledTools: config.disabledWriteTools,
    vendor: profile,
    encounter: config.sandbox?.encounter,
    performer: config.sandbox?.performer,
    ...(config.sandbox?.includeMetaTag ? { includeMetaTag: true } : {}),
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

  const vendorOnlyObservation = (): { saved: false; outcome: string } | undefined => {
    const blocked = vendorBlocksTool(options.vendor, "other");
    return blocked ? { saved: false, outcome: blocked } : undefined;
  };

  const readBackAfterCreate = async (
    sent: Resource,
    created: Resource & { id: string },
  ): Promise<{ matched: boolean; diff: string } | undefined> => {
    if (!client.readResource || !created.resourceType) return undefined;
    try {
      const persisted = await client.readResource(created.resourceType, created.id);
      return diffSentVsPersisted(
        sent,
        persisted,
        options.vendor?.readBack ?? {
          ignoreAddedCodings: false,
          ignoreValueQuantityExtensions: false,
        },
      );
    } catch {
      return {
        matched: false,
        diff: "Read-back failed. The create was already accepted. The persisted resource was not compared.",
      };
    }
  };

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
        const noteBlocked = vendorOnlyObservation();
        if (noteBlocked) return noteBlocked;
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
        const { patientId, label, value, unit, encounter, performer } =
          recordObservationSchema.parse(input);
        const proposal = {
          toolName: "record_observation",
          resourceType: "Observation",
          patientId,
        };
        const policyBefore = await checkWritePolicy(proposal);
        if (policyBefore.deny) return policyDeniedResult(policyBefore.reason);
        // Same pinned coding table as the web binding (see ./vitals.ts).
        // The vendor profile runs BEFORE the approval prompt so the
        // reviewer sees the encounter, performer, and codings that will post.
        // effectiveDateTime is stamped after approval, at the moment of the save.
        const coded = codeObservation(label, unit);
        let resource: Observation = {
          resourceType: "Observation",
          status: "final",
          code: coded.code,
          ...(coded.category ? { category: coded.category } : {}),
          subject: { reference: `Patient/${patientId}` },
          valueQuantity: {
            value,
            // The typed string stays here. The vendor profile replaces unit
            // with the sandbox fixture's unit (Epic: the UCUM code; Oracle
            // Celsius: degC) before this resource is posted.
            unit,
            ...(coded.ucum ? { system: UCUM_SYSTEM, code: coded.ucum } : {}),
          },
          meta: { tag: [MCP_WRITE_TAG], security: [AIAST_LABEL] },
        };
        try {
          resource = applyVendorProfile(options.vendor, resource, {
            encounter: encounter ?? options.encounter,
            performer: performer ?? options.performer,
            includeMetaTag: options.includeMetaTag,
          });
        } catch (error) {
          if (error instanceof VendorWriteError) {
            return { saved: false, outcome: error.message };
          }
          throw error;
        }
        const codingSummary = (resource.code?.coding ?? [])
          .map((coding) => `${coding.code ?? ""}`)
          .filter(Boolean)
          .join(", ");
        const decision = await decide({
          title: "Record this observation?",
          summary: [
            `Patient: Patient/${patientId}`,
            `Resource: Observation`,
            `Label: ${JSON.stringify(label)}`,
            `Value: ${value} ${JSON.stringify(resource.valueQuantity?.unit ?? unit)}`,
            ...(codingSummary ? [`Codes: ${codingSummary}`] : []),
            ...(resource.encounter?.reference
              ? [`Encounter: ${resource.encounter.reference}`]
              : []),
            ...(resource.performer?.[0]?.reference
              ? [`Performer: ${resource.performer[0].reference} (legal authenticator)`]
              : []),
            "Effective time is set when this is approved.",
          ].join("\n"),
        });
        if (decision !== "approved") {
          return decision === "denied" ? DENIED_RESULT : UNAVAILABLE_RESULT;
        }
        const policyAtCommit = await checkWritePolicy(proposal);
        if (policyAtCommit.deny) {
          return policyDeniedResult(policyAtCommit.reason);
        }
        resource = { ...resource, effectiveDateTime: new Date().toISOString() };
        const created = await client.createResource(resource);
        await emitWriteProvenance("Observation", created.id);
        const readBack = await readBackAfterCreate(resource, created);
        return {
          saved: true,
          resourceType: "Observation",
          id: created.id,
          ...(readBack ? { readBack } : {}),
        };
      },
    },
    {
      name: "record_superseding_observation",
      proposesWrite: true,
      description:
        "Propose a new observation that supersedes an earlier one on the same chart, for when a previously recorded value was wrong. The new value is filed as an ADDITIONAL entry linked to the one it supersedes; the earlier entry is NOT changed, NOT deleted, and NOT marked as an error. The human operator reviews the exact values in an approval prompt; nothing is saved unless they approve.",
      inputSchema: supersedingObservationSchema,
      async execute(input: unknown) {
        const { patientId, supersedes, value, unit } =
          supersedingObservationSchema.parse(input);
        const proposal = {
          toolName: "record_superseding_observation",
          resourceType: "Observation",
          patientId,
        };
        const policyBefore = await checkWritePolicy(proposal);
        if (policyBefore.deny) return policyDeniedResult(policyBefore.reason);
        const supersedeBlocked = vendorOnlyObservation();
        if (supersedeBlocked) return supersedeBlocked;

        // Fetch the original BEFORE asking, so the reviewer sees the real row
        // being superseded and a bogus id refuses instead of minting a
        // dangling reference.
        const [original] = await client.searchResources("Observation", {
          _id: supersedes,
          _count: "1",
        });
        if (!original) {
          return {
            saved: false,
            outcome: `No observation ${supersedes} is readable, so there is nothing to supersede. Nothing was saved to the chart.`,
          };
        }
        if (original.subject?.reference !== `Patient/${patientId}`) {
          return {
            saved: false,
            outcome: `Observation ${supersedes} does not belong to patient ${patientId}. Nothing was saved to the chart.`,
          };
        }
        const priorLabel =
          original.code?.text ??
          original.code?.coding?.[0]?.display ??
          "Observation";
        const priorValue = original.valueQuantity
          ? `${original.valueQuantity.value ?? ""} ${original.valueQuantity.unit ?? ""}`.trim()
          : "(no value)";

        const decision = await decide({
          title: "File a superseding observation?",
          summary: [
            `Patient: Patient/${patientId}`,
            `Resource: Observation`,
            `Supersedes: Observation/${supersedes} — ${JSON.stringify(`${priorLabel} ${priorValue}`)}`,
            `New value: ${value} ${JSON.stringify(unit)}`,
            "The earlier entry stays on the chart as a final result. This does not mark it as an error and does not delete it.",
          ].join("\n"),
        });
        if (decision !== "approved") {
          return decision === "denied" ? DENIED_RESULT : UNAVAILABLE_RESULT;
        }
        const policyAtCommit = await checkWritePolicy(proposal);
        if (policyAtCommit.deny) {
          return policyDeniedResult(policyAtCommit.reason);
        }
        const coded = codeObservation(priorLabel, unit);
        // One create: the supersession link rides the resource, so there is
        // no second write that could fail and leave two contradictory values
        // with nothing joining them.
        const resource: Observation = {
          resourceType: "Observation",
          status: "final",
          code: original.code ?? { text: priorLabel },
          ...(original.category ? { category: original.category } : {}),
          subject: { reference: `Patient/${patientId}` },
          // The original's measurement time; `issued` marks the correction.
          ...(original.effectiveDateTime
            ? { effectiveDateTime: original.effectiveDateTime }
            : {}),
          issued: new Date().toISOString(),
          valueQuantity: {
            value,
            unit,
            ...(coded.ucum ? { system: UCUM_SYSTEM, code: coded.ucum } : {}),
          },
          extension: [
            {
              url: OBSERVATION_REPLACES_EXTENSION,
              valueReference: { reference: `Observation/${supersedes}` },
            },
          ],
          meta: { tag: [MCP_WRITE_TAG], security: [AIAST_LABEL] },
        };
        const created = await client.createResource(resource);
        await emitWriteProvenance("Observation", created.id);
        return {
          saved: true,
          resourceType: "Observation",
          id: created.id,
          supersedes,
          outcome: `Saved as a new observation that supersedes Observation/${supersedes}. The earlier entry stays on the chart as a final result — this does not mark it as an error. Retracting it requires the EHR's own correction workflow.`,
        };
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
        const taskBlocked = vendorOnlyObservation();
        if (taskBlocked) return taskBlocked;
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
