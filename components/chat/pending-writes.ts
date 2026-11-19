import { OBSERVATION_REPLACES_EXTENSION } from "@/lib/fhir/vitals";
import {
  buildObservationApproval,
  vendorBlocksTool,
  type VendorWriteContext,
} from "@/lib/fhir/vendor-profile";
import type { DemoWriteTool } from "@/lib/demo-milestones";
import type { CitedEvidence, SessionRead } from "@/packages/mcp/src/proposal-evidence";

const WRITE_TYPES = new Set([
  "tool-add_note",
  "tool-record_observation",
  "tool-record_superseding_observation",
  "tool-create_task",
]);

export type PendingWriteItem = {
  approvalId: string;
  toolCallId: string;
  tool: DemoWriteTool;
  patientId: string;
  title: string;
  resourceType: string;
  fields: { label: string; value: string }[];
  preview?: unknown;
  blocked?: string;
  evidence?: {
    cited?: CitedEvidence[];
    sessionReads?: SessionRead[];
    readsTruncated?: boolean;
  };
};

type ApprovalPart = {
  type: string;
  state: string;
  toolCallId: string;
  input: {
    patientId: string;
    text?: string;
    label?: string;
    value?: number;
    unit?: string;
    encounter?: string;
    performer?: string;
    supersedes?: string;
    description?: string;
    dueDate?: string;
  };
  approval: { id: string };
};

function isApprovalPart(part: unknown): part is ApprovalPart {
  if (!part || typeof part !== "object") return false;
  const value = part as Partial<ApprovalPart>;
  return (
    typeof value.type === "string" &&
    WRITE_TYPES.has(value.type) &&
    value.state === "approval-requested" &&
    typeof value.toolCallId === "string" &&
    typeof value.approval?.id === "string" &&
    typeof value.input?.patientId === "string"
  );
}

function toolOf(type: string): DemoWriteTool {
  return type.slice("tool-".length) as DemoWriteTool;
}

export function pendingWriteItem(
  part: ApprovalPart,
  vendor: VendorWriteContext | null,
  evidence: PendingWriteItem["evidence"],
): PendingWriteItem {
  const tool = toolOf(part.type);
  const patientId = part.input.patientId;
  const blocked = vendorBlocksTool(vendor?.profile, "other");
  if (tool === "add_note") {
    return {
      approvalId: part.approval.id,
      toolCallId: part.toolCallId,
      tool,
      patientId,
      title: "Add this note to the chart?",
      resourceType: "Communication",
      fields: [
        { label: "Patient", value: `Patient/${patientId}` },
        { label: "Note", value: part.input.text ?? "" },
      ],
      blocked,
      evidence,
      preview: blocked
        ? undefined
        : {
            resourceType: "Communication",
            status: "completed",
            subject: { reference: `Patient/${patientId}` },
            sent: "<server time when approved>",
            payload: [{ contentString: part.input.text ?? "" }],
          },
    };
  }
  if (tool === "record_observation") {
    const approval = buildObservationApproval({
      patientId,
      label: part.input.label ?? "",
      value: part.input.value ?? 0,
      unit: part.input.unit ?? "",
      encounter: part.input.encounter,
      performer: part.input.performer,
      vendor,
    });
    return {
      approvalId: part.approval.id,
      toolCallId: part.toolCallId,
      tool,
      patientId,
      title: "Record this observation?",
      resourceType: "Observation",
      fields: approval.fields,
      preview: approval.preview,
      blocked: approval.blocked,
      evidence,
    };
  }
  if (tool === "record_superseding_observation") {
    return {
      approvalId: part.approval.id,
      toolCallId: part.toolCallId,
      tool,
      patientId,
      title: "File a superseding observation?",
      resourceType: "Observation",
      fields: [
        { label: "Patient", value: `Patient/${patientId}` },
        { label: "Supersedes", value: `Observation/${part.input.supersedes ?? ""}` },
        { label: "New value", value: `${part.input.value ?? ""} ${part.input.unit ?? ""}` },
        {
          label: "Note",
          value:
            "The earlier entry stays on the chart as a final result. This does not mark it as an error, and does not delete it. Retracting it requires the EHR's own correction workflow.",
        },
      ],
      blocked,
      evidence,
      preview: blocked
        ? undefined
        : {
            resourceType: "Observation",
            status: "final",
            code: "<copied from the superseded observation>",
            subject: { reference: `Patient/${patientId}` },
            effectiveDateTime: "<copied from the superseded observation>",
            issued: "<server time when approved>",
            valueQuantity: { value: part.input.value, unit: part.input.unit },
            extension: [
              {
                url: OBSERVATION_REPLACES_EXTENSION,
                valueReference: { reference: `Observation/${part.input.supersedes ?? ""}` },
              },
            ],
          },
    };
  }
  return {
    approvalId: part.approval.id,
    toolCallId: part.toolCallId,
    tool: "create_task",
    patientId,
    title: "Create this task?",
    resourceType: "Task",
    fields: [
      { label: "Patient", value: `Patient/${patientId}` },
      { label: "Task", value: part.input.description ?? "" },
      ...(part.input.dueDate ? [{ label: "Due", value: part.input.dueDate }] : []),
    ],
    blocked,
    evidence,
    preview: blocked
      ? undefined
      : {
          resourceType: "Task",
          status: "requested",
          intent: "order",
          description: part.input.description ?? "",
          for: { reference: `Patient/${patientId}` },
          authoredOn: "<server time when approved>",
          ...(part.input.dueDate
            ? { restriction: { period: { end: `${part.input.dueDate}T23:59:59Z` } } }
            : {}),
        },
  };
}

/**
 * Pending write cards in the last assistant message. Earlier messages are
 * left to their own cards: the chat client only records a decision on the
 * latest message.
 */
export function pendingWritesInLastMessage(
  messages: readonly { role: string; parts: readonly unknown[] }[],
  vendor: VendorWriteContext | null,
  evidenceFor: (input: unknown, toolCallId: string) => PendingWriteItem["evidence"],
): PendingWriteItem[] {
  const last = [...messages].reverse().find((message) => message.role === "assistant");
  if (!last) return [];
  const items: PendingWriteItem[] = [];
  for (const part of last.parts) {
    if (!isApprovalPart(part)) continue;
    items.push(pendingWriteItem(part, vendor, evidenceFor(part.input, part.toolCallId)));
  }
  return items;
}

export type BatchChoice = "approve" | "decline";

export function decisionsForSubmit(
  items: readonly { approvalId: string; tool: DemoWriteTool }[],
  choices: Readonly<Record<string, BatchChoice | undefined>>,
): { approvalId: string; tool: DemoWriteTool; approved: boolean }[] {
  const chosen = [];
  for (const item of items) {
    const choice = choices[item.approvalId];
    if (choice !== "approve" && choice !== "decline") continue;
    chosen.push({ approvalId: item.approvalId, tool: item.tool, approved: choice === "approve" });
  }
  return chosen;
}

export function declineAllChoices(ids: readonly string[]): Record<string, "decline"> {
  return Object.fromEntries(ids.map((id) => [id, "decline" as const]));
}

/** Pull undecided approval parts out of a message so the decided ones can be sent. */
export function splitPendingParts<T>(
  parts: readonly T[],
  decidedIds: ReadonlySet<string>,
): { kept: T[]; parked: T[] } {
  const kept: T[] = [];
  const parked: T[] = [];
  for (const part of parts) {
    if (isApprovalPart(part) && !decidedIds.has(part.approval.id)) parked.push(part);
    else kept.push(part);
  }
  return { kept, parked };
}
