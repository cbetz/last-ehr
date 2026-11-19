import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BatchReview } from "@/components/chat/batch-review";
import {
  decisionsForSubmit,
  declineAllChoices,
  pendingWritesInLastMessage,
  splitPendingParts,
} from "@/components/chat/pending-writes";
import { NO_CITED_EVIDENCE } from "@/packages/mcp/src/proposal-evidence";

const note = {
  type: "tool-add_note",
  state: "approval-requested",
  toolCallId: "call-note",
  approval: { id: "approval-note" },
  input: { patientId: "maria", text: "Heart rate reviewed." },
};
const task = {
  type: "tool-create_task",
  state: "approval-requested",
  toolCallId: "call-task",
  approval: { id: "approval-task" },
  input: { patientId: "maria", description: "Reassess asthma." },
};
const otherPatient = {
  type: "tool-add_note",
  state: "approval-requested",
  toolCallId: "call-other",
  approval: { id: "approval-other" },
  input: { patientId: "john", text: "Left unset." },
};

describe("batch review decisions", () => {
  const items = pendingWritesInLastMessage(
    [{ role: "assistant", parts: [note, task, otherPatient] }],
    null,
    () => ({ cited: [], sessionReads: [] }),
  );

  it("submits only the proposals the reviewer decided", () => {
    const chosen = decisionsForSubmit(items, {
      "approval-note": "approve",
      "approval-task": "decline",
    });
    expect(chosen).toEqual([
      { approvalId: "approval-note", tool: "add_note", approved: true },
      { approvalId: "approval-task", tool: "create_task", approved: false },
    ]);
    const { kept, parked } = splitPendingParts(
      [note, task, otherPatient],
      new Set(chosen.map((item) => item.approvalId)),
    );
    expect(kept).toEqual([note, task]);
    expect(parked).toEqual([otherPatient]);
  });

  it("decline-all marks every item and does not invent an approve-all", () => {
    expect(declineAllChoices(items.map((item) => item.approvalId))).toEqual({
      "approval-note": "decline",
      "approval-task": "decline",
      "approval-other": "decline",
    });
    expect(decisionsForSubmit).not.toHaveProperty("approveAll");
  });

  it("renders each diff and citation flag with per-item controls and no approve-all", () => {
    const html = renderToStaticMarkup(
      createElement(BatchReview, { items, onSubmit: () => {} }),
    );
    expect(html).toContain("Review each proposal");
    expect(html).toContain("Patient/maria");
    expect(html).toContain("Patient/john");
    expect(html).toContain("Heart rate reviewed.");
    expect(html).toContain("Proposed change");
    expect(html).toContain(NO_CITED_EVIDENCE);
    expect(html).toContain("Decline all");
    expect(html).toContain("Submit decisions");
    expect(html.toLowerCase()).not.toContain("approve all");
    expect(html.match(/Approve/g)?.length).toBe(items.length);
  });

  it("leaves a single pending proposal on its own card", () => {
    const one = pendingWritesInLastMessage(
      [{ role: "assistant", parts: [note] }],
      null,
      () => ({ cited: [] }),
    );
    expect(one).toHaveLength(1);
    expect(one.length >= 2).toBe(false);
  });
});
