/**
 * Browser-only funnel observations from the AI SDK's tool states. This module
 * returns allowlisted labels only; inputs, output text, and resource ids never
 * become event properties. Tool-call ids stay in memory solely for deduping.
 */
const WRITE_RESOURCE_TYPES = {
  add_note: "Communication",
  record_observation: "Observation",
  record_superseding_observation: "Observation",
  create_task: "Task",
} as const;

export type DemoWriteTool = keyof typeof WRITE_RESOURCE_TYPES;
type DemoReadTool =
  | "search_patients"
  | "show_patient_info"
  | "read_chart_section"
  | "read_document";
type DemoTool = DemoReadTool | DemoWriteTool;

export type DemoMilestone =
  | {
      event: "demo_first_tool_result";
      properties: { tool: DemoTool; kind: "read" | "write" };
    }
  | {
      event: "demo_first_approval_shown";
      properties: { tool: DemoWriteTool };
    }
  | {
      event: "demo_write_outcome";
      properties: {
        tool: DemoWriteTool;
        outcome: "saved" | "canceled" | "failed";
      };
    };

type MessageSnapshot = { role: string; parts: readonly unknown[] };
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function knownTool(type: unknown): DemoTool | undefined {
  switch (type) {
    case "tool-search_patients": return "search_patients";
    case "tool-show_patient_info": return "show_patient_info";
    case "tool-read_chart_section": return "read_chart_section";
    case "tool-read_document": return "read_document";
    case "tool-add_note": return "add_note";
    case "tool-record_observation": return "record_observation";
    case "tool-record_superseding_observation": return "record_superseding_observation";
    case "tool-create_task": return "create_task";
  }
}

function isWriteTool(tool: DemoTool): tool is DemoWriteTool {
  return Object.hasOwn(WRITE_RESOURCE_TYPES, tool);
}

function hasError(output: Record<string, unknown>): boolean {
  return output.error !== undefined || output.isError === true ||
    output.success === false || output.denied === true ||
    output.type === "execution-denied";
}

function readReturned(tool: DemoReadTool, output: unknown): boolean {
  if (!record(output) || hasError(output)) return false;
  switch (tool) {
    case "search_patients": return Array.isArray(output.patients);
    case "show_patient_info": return record(output.patient);
    case "read_chart_section": return Array.isArray(output.entries);
    // An unreadable attachment is a completed tool result, not proof that
    // its contents were read. This milestone measures a returned result only.
    case "read_document": return typeof output.text === "string" ||
      typeof output.unreadable === "string";
  }
}

function writeSaved(tool: DemoWriteTool, part: Record<string, unknown>): boolean {
  const output = part.output;
  // Only the final server result after explicit approval can confirm a save.
  // The tools return this shape after createResource resolves. An approval
  // response, preliminary result, denial, or error-shaped output is not it.
  return record(part.approval) && part.approval.approved === true &&
    record(output) && !hasError(output) &&
    output.resourceType === WRITE_RESOURCE_TYPES[tool] &&
    typeof output.id === "string" && /^[A-Za-z0-9.-]{1,64}$/.test(output.id) &&
    typeof output.summary === "string";
}

/** One tracker per mounted chat; repeated stream snapshots emit nothing twice. */
export function createDemoMilestoneTracker() {
  let firstToolResult = false;
  let firstApproval = false;
  const completedWrites = new Set<string>();

  return (messages: readonly MessageSnapshot[]): DemoMilestone[] => {
    const events: DemoMilestone[] = [];
    const toolReturned = (tool: DemoTool, kind: "read" | "write") => {
      if (firstToolResult) return;
      firstToolResult = true;
      events.push({ event: "demo_first_tool_result", properties: { tool, kind } });
    };

    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (!record(part)) continue;
        const tool = knownTool(part.type);
        if (!tool || typeof part.toolCallId !== "string" || !part.toolCallId) continue;
        if (!isWriteTool(tool)) {
          if (part.state === "output-available" && part.preliminary !== true &&
              readReturned(tool, part.output)) toolReturned(tool, "read");
          continue;
        }

        if (part.state === "approval-requested" && !firstApproval) {
          firstApproval = true;
          events.push({ event: "demo_first_approval_shown", properties: { tool } });
        }
        if (completedWrites.has(part.toolCallId)) continue;

        let outcome: "saved" | "canceled" | "failed" | undefined;
        if (part.state === "output-denied" && record(part.approval) &&
            part.approval.approved === false) outcome = "canceled";
        else if (part.state === "output-error") outcome = "failed";
        else if (part.state === "output-available" && part.preliminary !== true) {
          outcome = writeSaved(tool, part) ? "saved" : "failed";
        }
        if (!outcome) continue;
        completedWrites.add(part.toolCallId);
        if (outcome === "saved") toolReturned(tool, "write");
        events.push({ event: "demo_write_outcome", properties: { tool, outcome } });
      }
    }
    return events;
  };
}
