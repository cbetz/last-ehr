import type {
  Communication,
  Observation,
  Resource,
} from "@medplum/fhirtypes";
import { z } from "zod";

import type { ApprovalRequest, RequestApproval } from "./approval.js";
import type { FhirReadClient, McpReadTool } from "./read-tools.js";

// Proposal-shaped writes: the same two write actions as the web demo
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

export type WriteToolOptions = {
  /**
   * Emit a Provenance resource per approved write (author = the agent,
   * verifier = the approving human), per the AI Transparency IG pattern.
   * Non-blocking: an emission failure is reported on stderr and never
   * fails a write the reviewer already approved.
   */
  emitProvenance?: boolean;
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

export type McpWriteTool = Omit<McpReadTool, "name"> & {
  name: "add_note" | "record_observation";
  /** Marks the tool as a proposal-shaped write for annotations/docs. */
  proposesWrite: true;
};

export function createWriteTools(
  client: FhirWriteClient,
  requestApproval: RequestApproval,
  options: WriteToolOptions = {},
): McpWriteTool[] {
  const decide = (request: ApprovalRequest) => requestApproval(request);

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

  return [
    {
      name: "add_note",
      proposesWrite: true,
      description:
        "Propose adding a free-text note to a patient's chart. The human operator reviews the exact note in an approval prompt; nothing is saved unless they approve.",
      inputSchema: addNoteSchema,
      async execute(input: unknown) {
        const { patientId, text } = addNoteSchema.parse(input);
        const decision = await decide({
          title: "Add this note to the chart?",
          summary: [
            `Patient: Patient/${patientId}`,
            `Resource: Communication`,
            `Note: ${text}`,
          ].join("\n"),
        });
        if (decision !== "approved") {
          return decision === "denied" ? DENIED_RESULT : UNAVAILABLE_RESULT;
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
        const decision = await decide({
          title: "Record this observation?",
          summary: [
            `Patient: Patient/${patientId}`,
            `Resource: Observation`,
            `Label: ${label}`,
            `Value: ${value} ${unit}`,
          ].join("\n"),
        });
        if (decision !== "approved") {
          return decision === "denied" ? DENIED_RESULT : UNAVAILABLE_RESULT;
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
  ];
}
