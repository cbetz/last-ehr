import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConfirmWrite } from "@/components/chat/confirm-write";
import { NO_CITED_EVIDENCE } from "@/packages/mcp/src/proposal-evidence";

const proposed = {
  resourceType: "Observation",
  status: "final",
  code: { text: "Heart rate" },
  subject: { reference: "Patient/maria-1" },
  valueQuantity: { value: 88, unit: "bpm" },
};

const sessionReads = [
  {
    reference: "Observation/hr-1",
    resourceType: "Observation",
    id: "hr-1",
    tool: "read_chart_section",
    keyFields: [
      { label: "Text", value: "Heart rate 72 /min" },
      { label: "Date", value: "2026-01-02" },
    ],
  },
  {
    reference: "Patient/maria-1",
    resourceType: "Patient",
    id: "maria-1",
    tool: "search_patients",
    keyFields: [{ label: "Name", value: "Garcia, Maria" }],
  },
];

function card(evidence?: {
  cited?: { reference: string; reason?: string }[];
  sessionReads?: typeof sessionReads;
}) {
  return renderToStaticMarkup(
    createElement(ConfirmWrite, {
      title: "Record this observation?",
      resourceType: "Observation",
      fields: [
        { label: "Patient", value: "Patient/maria-1" },
        { label: "Label", value: "Heart rate" },
        { label: "Value", value: "88 bpm" },
      ],
      preview: proposed,
      evidence,
      onApprove: () => {},
      onCancel: () => {},
    }),
  );
}

describe("approval card evidence", () => {
  it("shows the proposed diff beside cited resources and their key fields", () => {
    const html = card({
      cited: [{ reference: "Observation/hr-1", reason: "prior rate on the chart" }],
      sessionReads,
    });
    expect(html).toContain("Proposed change");
    expect(html).toContain("+++ proposed Observation");
    expect(html).toContain("88");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("prior rate on the chart");
    expect(html).toContain("Heart rate 72 /min");
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).not.toContain(NO_CITED_EVIDENCE);
    expect(html).toContain("Approve");
  });

  it("flags a proposal that cites nothing and still lists what was read", () => {
    const html = card({ cited: [], sessionReads });
    expect(html).toContain(NO_CITED_EVIDENCE);
    expect(html).toContain("Observation/hr-1");
    expect(html).toContain("Garcia, Maria");
    expect(html).toContain("Read before this proposal");
  });

  it("marks a citation that was not in the session reads", () => {
    const html = card({
      cited: [{ reference: "Observation/made-up", reason: "sounds plausible" }],
      sessionReads,
    });
    expect(html).toContain("Not in this session");
    expect(html).toContain("reads.");
    expect(html).toContain("sounds plausible");
    expect(html).not.toContain(NO_CITED_EVIDENCE);
  });

  it("still renders when a caller passes no evidence", () => {
    const html = card();
    expect(html).toContain(NO_CITED_EVIDENCE);
    expect(html).toContain("+++ proposed Observation");
    expect(html).toContain("Cancel");
  });
});
