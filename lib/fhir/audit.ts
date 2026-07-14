import type { AuditEvent } from "@medplum/fhirtypes";
import type { UIMessage } from "ai";

import { DEMO_TAG_SYSTEM } from "@/lib/ai/tools";
import type { FhirBackend } from "./backend";

// Opt-in rejected-proposal audit trail (LASTEHR_AUDIT_REJECTED_PROPOSALS).
// An approved write leaves its own evidence: the created resource. A denial
// leaves nothing on the chart by design, so deployments that need to show
// "the agent proposed X and a person said no" can record a FHIR AuditEvent
// per denial. Off by default; the demo posture is unchanged unless enabled.

export type DeniedProposal = {
  approvalId: string;
  /** Tool name without the "tool-" part prefix, e.g. "add_note". */
  toolName: string;
  patientId?: string;
};

type ApprovalToolPart = {
  type?: unknown;
  state?: unknown;
  input?: unknown;
  approval?: { id?: unknown; approved?: unknown };
};

/**
 * Extracts write proposals the user denied in this request. Only the latest
 * assistant message can carry a fresh denial: the client sends it as an
 * `approval-responded` part exactly once, and after the server processes the
 * turn it appears in history as `output-denied`. That makes this scan
 * naturally once-per-denial without a persistence-side dedupe.
 *
 * The messages come from the client, so treat every field as untrusted: this
 * only ever feeds an AuditEvent write, bounded by the same rate limit and
 * session tagging as any other chat request.
 */
export function findDeniedProposals(messages: UIMessage[]): DeniedProposal[] {
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  if (!lastAssistant) return [];

  const denied: DeniedProposal[] = [];
  for (const part of lastAssistant.parts as ApprovalToolPart[]) {
    if (
      typeof part?.type !== "string" ||
      !part.type.startsWith("tool-") ||
      part.state !== "approval-responded" ||
      part.approval?.approved !== false ||
      typeof part.approval.id !== "string"
    ) {
      continue;
    }
    const input =
      typeof part.input === "object" && part.input !== null
        ? (part.input as Record<string, unknown>)
        : {};
    const patientId =
      typeof input.patientId === "string" &&
      /^[A-Za-z0-9-]{1,64}$/.test(input.patientId)
        ? input.patientId
        : undefined;
    denied.push({
      approvalId: part.approval.id.slice(0, 128),
      toolName: part.type.slice("tool-".length).slice(0, 64),
      patientId,
    });
  }
  return denied;
}

/**
 * Records one denied proposal as a FHIR AuditEvent: an attempted RESTful
 * create whose outcome is a minor failure (blocked before execution by the
 * reviewing user). No proposed chart content is copied into the event; the
 * tool name, patient reference, and approval id are enough to answer "what
 * was rejected, on whose chart, when".
 */
export async function recordRejectedProposal(
  backend: FhirBackend,
  denial: DeniedProposal,
  sessionId?: string,
): Promise<void> {
  await backend.createResource<AuditEvent>({
    resourceType: "AuditEvent",
    type: {
      system: "http://terminology.hl7.org/CodeSystem/audit-event-type",
      code: "rest",
      display: "RESTful Operation",
    },
    subtype: [
      {
        system: "http://hl7.org/fhir/restful-interaction",
        code: "create",
        display: "create",
      },
    ],
    action: "C",
    recorded: new Date().toISOString(),
    // AuditEvent.outcome "4" = minor failure: the proposed create was
    // blocked before execution.
    outcome: "4",
    outcomeDesc: `Proposed ${denial.toolName} write was rejected by the reviewing user before execution.`,
    agent: [{ requestor: true, who: { display: "Reviewing user" } }],
    source: { observer: { display: "Last EHR" } },
    entity: [
      ...(denial.patientId
        ? [{ what: { reference: `Patient/${denial.patientId}` } }]
        : []),
      {
        detail: [
          { type: "tool", valueString: denial.toolName },
          { type: "approvalId", valueString: denial.approvalId },
        ],
      },
    ],
    meta: sessionId
      ? { tag: [{ system: DEMO_TAG_SYSTEM, code: `session-${sessionId}` }] }
      : undefined,
  });
}
