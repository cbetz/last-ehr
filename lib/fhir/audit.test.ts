import { describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";

import { findDeniedProposals, recordRejectedProposal } from "./audit";
import type { FhirBackend } from "./backend";

function assistantMessage(parts: unknown[]): UIMessage {
  return { id: "a1", role: "assistant", parts } as UIMessage;
}

const deniedNotePart = {
  type: "tool-add_note",
  toolCallId: "call-1",
  state: "approval-responded",
  input: { patientId: "p1", text: "do not save this" },
  approval: { id: "approval-1", approved: false },
};

describe("findDeniedProposals", () => {
  it("extracts a denial from the latest assistant message", () => {
    const denials = findDeniedProposals([
      { id: "u1", role: "user", parts: [{ type: "text", text: "no" }] } as UIMessage,
      assistantMessage([deniedNotePart]),
    ]);

    expect(denials).toEqual([
      { approvalId: "approval-1", toolName: "add_note", patientId: "p1" },
    ]);
  });

  it("ignores approvals, settled denials, and non-tool parts", () => {
    const denials = findDeniedProposals([
      assistantMessage([
        { type: "text", text: "done" },
        {
          ...deniedNotePart,
          toolCallId: "call-2",
          approval: { id: "approval-2", approved: true },
        },
        // Already processed in a prior turn; must not re-audit.
        {
          ...deniedNotePart,
          toolCallId: "call-3",
          state: "output-denied",
          approval: { id: "approval-3", approved: false },
        },
      ]),
    ]);

    expect(denials).toEqual([]);
  });

  it("only scans the latest assistant message", () => {
    const denials = findDeniedProposals([
      assistantMessage([deniedNotePart]),
      { id: "u2", role: "user", parts: [{ type: "text", text: "next" }] } as UIMessage,
      assistantMessage([{ type: "text", text: "hello" }]),
    ]);

    expect(denials).toEqual([]);
  });

  it("drops a patient id that is not a plausible resource id", () => {
    const denials = findDeniedProposals([
      assistantMessage([
        {
          ...deniedNotePart,
          input: { patientId: "p1&_evil=1", text: "x" },
        },
      ]),
    ]);

    expect(denials).toEqual([
      { approvalId: "approval-1", toolName: "add_note", patientId: undefined },
    ]);
  });
});

describe("recordRejectedProposal", () => {
  it("writes a session-tagged AuditEvent without proposed chart content", async () => {
    const createResource = vi.fn().mockResolvedValue({ id: "audit-1" });
    const backend = { createResource } as unknown as FhirBackend;

    await recordRejectedProposal(
      backend,
      { approvalId: "approval-1", toolName: "add_note", patientId: "p1" },
      "A",
    );

    expect(createResource).toHaveBeenCalledTimes(1);
    const event = createResource.mock.calls[0][0];
    expect(event).toMatchObject({
      resourceType: "AuditEvent",
      action: "C",
      outcome: "4",
      entity: [
        { what: { reference: "Patient/p1" } },
        {
          detail: [
            { type: "tool", valueString: "add_note" },
            { type: "approvalId", valueString: "approval-1" },
          ],
        },
      ],
      meta: { tag: [{ system: "http://lastehr.demo", code: "session-A" }] },
    });
    // The rejected note text must never be copied into the audit trail.
    expect(JSON.stringify(event)).not.toContain("do not save this");
  });

  it("omits the session tag and patient entity when absent", async () => {
    const createResource = vi.fn().mockResolvedValue({ id: "audit-2" });
    const backend = { createResource } as unknown as FhirBackend;

    await recordRejectedProposal(backend, {
      approvalId: "approval-9",
      toolName: "record_observation",
    });

    const event = createResource.mock.calls[0][0];
    expect(event.meta).toBeUndefined();
    expect(event.entity).toHaveLength(1);
  });
});
