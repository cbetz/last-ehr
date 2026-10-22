import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";

import { createDemoMilestoneTracker, type DemoMilestone } from "./demo-milestones";

const scanParts = (
  scan: ReturnType<typeof createDemoMilestoneTracker>,
  ...parts: unknown[]
) => scan([{ role: "assistant", parts }]);

const observation = (overrides: Record<string, unknown> = {}) => ({
  type: "tool-record_observation",
  toolCallId: "call-not-for-analytics",
  state: "output-available",
  approval: { id: "approval-not-for-analytics", approved: true },
  output: { id: "resource-123", resourceType: "Observation", summary: "Private chart text" },
  ...overrides,
});

describe("demo funnel milestones", () => {
  it("waits for a final read result, dedupes stream snapshots, and accepts an empty search", () => {
    const scan = createDemoMilestoneTracker();
    const read = {
      type: "tool-search_patients",
      toolCallId: "read-call",
      state: "output-available",
      output: { patients: [] },
    };
    expect(scanParts(scan, { ...read, state: "input-available" })).toEqual([]);
    expect(scanParts(scan, { ...read, preliminary: true })).toEqual([]);
    expect(scanParts(scan, { ...read, state: "output-error" })).toEqual([]);
    expect(scanParts(scan, { ...read, output: { error: "Private error" } })).toEqual([]);
    expect(scanParts(scan, read)).toEqual([{
      event: "demo_first_tool_result",
      properties: { tool: "search_patients", kind: "read" },
    }]);
    expect(scanParts(scan, read, { ...read, toolCallId: "another-read" })).toEqual([]);
  });

  it("counts an unreadable document as a returned result without claiming its contents were read", () => {
    expect(scanParts(createDemoMilestoneTracker(), {
      type: "tool-read_document",
      toolCallId: "read-call",
      state: "output-available",
      output: { unreadable: "Private document metadata" },
    })).toEqual([{
      event: "demo_first_tool_result",
      properties: { tool: "read_document", kind: "read" },
    }]);
  });

  it("counts the first rendered approval once, but never an approval response as a save", () => {
    const scan = createDemoMilestoneTracker();
    const pending = observation({ state: "approval-requested", output: undefined });
    expect(scanParts(scan, pending)).toEqual([{
      event: "demo_first_approval_shown",
      properties: { tool: "record_observation" },
    }]);
    expect(scanParts(scan, pending)).toEqual([]);
    expect(scanParts(scan, observation({ state: "approval-responded", output: undefined }))).toEqual([]);
    expect(scanParts(scan, observation({ preliminary: true }))).toEqual([]);
    expect(scanParts(scan, observation())).toEqual([
      { event: "demo_first_tool_result", properties: { tool: "record_observation", kind: "write" } },
      { event: "demo_write_outcome", properties: { tool: "record_observation", outcome: "saved" } },
    ]);
    expect(scanParts(scan, observation())).toEqual([]);
  });

  it("confirms cancellation only when the server returns output-denied", () => {
    const scan = createDemoMilestoneTracker();
    const declined = observation({
      state: "approval-responded",
      approval: { id: "private-approval", approved: false },
      output: undefined,
    });
    expect(scanParts(scan, declined)).toEqual([]);
    expect(scanParts(scan, { ...declined, state: "output-denied" })).toEqual([{
      event: "demo_write_outcome",
      properties: { tool: "record_observation", outcome: "canceled" },
    }]);
    expect(scanParts(scan, { ...declined, state: "output-denied" })).toEqual([]);
    expect(scanParts(createDemoMilestoneTracker(), observation({ state: "output-denied" }))).toEqual([]);
  });

  it.each([
    ["add_note", "Communication"],
    ["record_observation", "Observation"],
    ["record_superseding_observation", "Observation"],
    ["create_task", "Task"],
  ])("recognizes a confirmed %s save without reading its chart text", (tool, resourceType) => {
    const events = scanParts(createDemoMilestoneTracker(), observation({
      type: `tool-${tool}`,
      output: { id: "resource-123", resourceType, summary: "Private chart text" },
    }));
    expect(events).toContainEqual({
      event: "demo_write_outcome",
      properties: { tool, outcome: "saved" },
    });
    expect(JSON.stringify(events)).not.toMatch(/Private|resource-123|not-for-analytics/);
  });

  it.each([
    { id: "resource-123", resourceType: "Observation", summary: "private", isError: true },
    { id: "resource-123", resourceType: "Observation", summary: "private", error: "private" },
    { id: "resource-123", resourceType: "Observation", summary: "private", success: false },
    { id: "resource-123", resourceType: "Observation", summary: "private", denied: true },
    { id: "resource-123", resourceType: "Task", summary: "private" },
    { id: "", resourceType: "Observation", summary: "private" },
    { id: "https://private.example/patient", resourceType: "Observation", summary: "private" },
    { resourceType: "Observation", summary: "private" },
    { id: "resource-123", resourceType: "Observation" },
  ])("does not count malformed or error-shaped output as persistence: %j", (output) => {
    expect(scanParts(createDemoMilestoneTracker(), observation({ output }))).toEqual([{
      event: "demo_write_outcome",
      properties: { tool: "record_observation", outcome: "failed" },
    }]);
  });

  it("distinguishes policy/transport failures from a human cancellation", () => {
    expect(scanParts(createDemoMilestoneTracker(), observation({
      state: "output-error",
      errorText: "This write is blocked by deployment policy. Private reason",
    }))).toEqual([{
      event: "demo_write_outcome",
      properties: { tool: "record_observation", outcome: "failed" },
    }]);
    expect(scanParts(createDemoMilestoneTracker(), observation({ approval: undefined }))).toEqual([{
      event: "demo_write_outcome",
      properties: { tool: "record_observation", outcome: "failed" },
    }]);
  });

  it("ignores user content, unknown tools, and tool names carrying arbitrary text", () => {
    const scan = createDemoMilestoneTracker();
    expect(scan([{ role: "user", parts: [observation()] }])).toEqual([]);
    expect(scanParts(scan,
      { type: "text", text: "Saved a private chart" },
      observation({ type: "tool-Patient/private-id" }),
      observation({ type: "dynamic-tool", toolName: "record_observation" }),
      observation({ toolCallId: undefined }),
    )).toEqual([]);
  });

  it.each([true, false])("uses the actual SDK resumed stream for approved=%s", async (approved) => {
    const scan = createDemoMilestoneTracker();
    // The same state addToolApprovalResponse writes before the auto-resend.
    const message: UIMessage = {
      id: "assistant-private-id",
      role: "assistant",
      parts: [{
        type: "tool-record_observation",
        toolCallId: "call-not-for-analytics",
        state: "approval-responded",
        input: { patientId: "patient-private-id", value: 72 },
        approval: { id: "private-approval-id", approved },
      }],
    };
    const chunk: UIMessageChunk = approved
      ? { type: "tool-output-available", toolCallId: "call-not-for-analytics", output: observation().output }
      : { type: "tool-output-denied", toolCallId: "call-not-for-analytics" };
    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const events: DemoMilestone[] = [];
    for await (const snapshot of readUIMessageStream({ message, stream })) {
      events.push(...scan([snapshot]));
    }
    expect(events).toContainEqual({
      event: "demo_write_outcome",
      properties: { tool: "record_observation", outcome: approved ? "saved" : "canceled" },
    });
    expect(JSON.stringify(events)).not.toMatch(/private|resource-123|not-for-analytics/);
  });
});
