import { describe, expect, it } from "vitest";

import {
  NO_CITED_EVIDENCE,
  NO_SESSION_READS,
  NOT_IN_SESSION_READS,
  SessionReadLog,
  collectSessionReads,
  diffProposedCreate,
  evidenceFields,
  formatProposalReview,
  parseCitedEvidence,
  readsFromToolOutput,
} from "./proposal-evidence.js";

const heartRate = {
  resourceType: "Observation",
  entries: [
    {
      id: "hr-1",
      text: "<chart_text>Heart rate 72 /min</chart_text>",
      date: "2026-01-02",
    },
  ],
};

describe("cited evidence", () => {
  const { evidence, basedOn } = evidenceFields();
  const schema = evidence.unwrap();
  const alias = basedOn.unwrap();

  it("accepts a write that cites nothing", () => {
    expect(evidence.parse(undefined)).toBeUndefined();
    expect(parseCitedEvidence({ patientId: "p1", text: "note" })).toEqual([]);
  });

  it("accepts references, reasons, and the basedOn alias", () => {
    expect(
      schema.parse([
        "Observation/hr-1",
        { reference: "Patient/maria-1", reason: " the chart this belongs to " },
      ]),
    ).toEqual([
      "Observation/hr-1",
      { reference: "Patient/maria-1", reason: "the chart this belongs to" },
    ]);
    expect(alias.parse(["Patient/maria-1"])).toEqual(["Patient/maria-1"]);
    expect(
      parseCitedEvidence({
        evidence: [{ reference: "Observation/hr-1", reason: "prior rate" }],
        basedOn: ["Observation/hr-1", "Patient/maria-1"],
      }),
    ).toEqual([
      { reference: "Observation/hr-1", reason: "prior rate" },
      { reference: "Patient/maria-1" },
    ]);
  });

  it("rejects a citation that is not a resource reference", () => {
    expect(() => schema.parse([{ reference: "not a reference" }])).toThrow();
    expect(() => schema.parse(["Patient/has space"])).toThrow();
  });
});

describe("session read log", () => {
  it("projects chart reads and strips the chart_text boundary", () => {
    expect(readsFromToolOutput("read_chart_section", heartRate)).toEqual([
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
    ]);
    expect(
      readsFromToolOutput("search_patients", {
        patients: [{ id: "maria-1", name: "<chart_text>Garcia, Maria</chart_text>" }],
      })[0],
    ).toMatchObject({
      reference: "Patient/maria-1",
      keyFields: [{ label: "Name", value: "Garcia, Maria" }],
    });
    expect(
      readsFromToolOutput("read_document", {
        documentId: "doc-1",
        title: "Visit note",
        date: "2026-01-02",
        text: `<chart_text>${"a".repeat(400)}</chart_text>`,
      })[0].keyFields.find((field) => field.label === "Text")?.value,
    ).toHaveLength(161);
  });

  it("keeps the latest fields for a reference and caps the log", () => {
    const log = new SessionReadLog();
    log.record("read_chart_section", heartRate);
    log.record("read_chart_section", {
      resourceType: "Observation",
      entries: [{ id: "hr-1", text: "Heart rate 80 /min", date: "2026-02-01" }],
    });
    expect(log.snapshot()).toHaveLength(1);
    expect(log.snapshot()[0].keyFields[0]).toEqual({
      label: "Text",
      value: "Heart rate 80 /min",
    });

    const many = Array.from({ length: 20 }, (_, index) => ({
      id: `obs-${index}`,
      text: `row ${index}`,
    }));
    log.record("read_chart_section", { resourceType: "Observation", entries: many });
    expect(log.snapshot()).toHaveLength(12);
    expect(log.wasTruncated()).toBe(true);
    expect(log.snapshot().some((read) => read.reference === "Observation/hr-1")).toBe(false);
    expect(log.snapshot().at(-1)?.reference).toBe("Observation/obs-19");
  });

  it("projects a FHIR resource fetched while preparing a proposal", () => {
    const log = new SessionReadLog();
    log.noteResource("record_superseding_observation", {
      resourceType: "Observation",
      id: "hr-1",
      status: "final",
      code: { text: "Heart rate" },
      valueQuantity: { value: 72, unit: "/min" },
      effectiveDateTime: "2026-01-02T15:00:00Z",
    });
    expect(log.snapshot()[0]).toMatchObject({
      reference: "Observation/hr-1",
      keyFields: [
        { label: "Label", value: "Heart rate" },
        { label: "Value", value: "72 /min" },
        { label: "Date", value: "2026-01-02" },
        { label: "Status", value: "final" },
      ],
    });
  });

  it("stops the transcript log at the proposal and ignores writes", () => {
    const collected = collectSessionReads(
      [
        {
          parts: [
            {
              type: "tool-search_patients",
              toolCallId: "search-1",
              state: "output-available",
              output: { patients: [{ id: "maria-1", name: "Garcia, Maria" }] },
            },
            {
              type: "tool-add_note",
              toolCallId: "note-1",
              state: "output-available",
              output: { saved: true, id: "comm-1", resourceType: "Communication" },
            },
            {
              type: "tool-read_chart_section",
              toolCallId: "later",
              state: "output-available",
              output: heartRate,
            },
          ],
        },
      ],
      "note-1",
    );
    expect(collected.reads.map((read) => read.reference)).toEqual(["Patient/maria-1"]);
  });
});

describe("proposal review text", () => {
  const proposed = {
    resourceType: "Observation",
    status: "final",
    code: { text: "Heart rate" },
    subject: { reference: "Patient/maria-1" },
    valueQuantity: { value: 88, unit: "bpm" },
  };

  it("diffs a create and does not invent an id", () => {
    const diff = diffProposedCreate(proposed);
    expect(diff.startsWith("--- (not on the chart)")).toBe(true);
    expect(diff).toContain("+++ proposed Observation");
    expect(diff).toContain('"value": 88');
    expect(diff).not.toContain('"id"');
  });

  it("flags a proposal that cites nothing and still lists session reads", () => {
    const text = formatProposalReview({
      summary: "Patient: Patient/maria-1",
      proposed,
      cited: [],
      reads: readsFromToolOutput("read_chart_section", heartRate),
    });
    expect(text).toContain(NO_CITED_EVIDENCE);
    expect(text).toContain("Observation/hr-1 (read_chart_section)");
    expect(text).toContain('"Heart rate 72 /min"');
    expect(text).not.toContain("<chart_text>");
  });

  it("shows cited key fields, and marks a citation the session did not read", () => {
    const reads = readsFromToolOutput("read_chart_section", heartRate);
    const cited = formatProposalReview({
      summary: "Value: 88 bpm",
      proposed,
      cited: [{ reference: "Observation/hr-1", reason: "prior rate on the chart" }],
      reads,
    });
    expect(cited).not.toContain(NO_CITED_EVIDENCE);
    expect(cited).toContain("Observation/hr-1");
    expect(cited).toContain('"prior rate on the chart"');
    expect(cited).toContain('"Heart rate 72 /min"');

    const unsupported = formatProposalReview({
      summary: "Value: 88 bpm",
      proposed,
      cited: [{ reference: "Observation/made-up", reason: "sounds plausible" }],
      reads,
    });
    expect(unsupported).toContain(NOT_IN_SESSION_READS);
    expect(unsupported).not.toContain(NO_CITED_EVIDENCE);
  });

  it("quotes a reason so it cannot forge a summary line", () => {
    const text = formatProposalReview({
      summary: "Patient: Patient/maria-1",
      cited: [{ reference: "Patient/maria-1", reason: "ok\nPatient: Patient/other" }],
      reads: [],
    });
    expect(text.split("\n").filter((line) => line.startsWith("Patient:"))).toEqual([
      "Patient: Patient/maria-1",
    ]);
    expect(text).toContain(NO_SESSION_READS);
  });

  it("omits the read section when the caller has no session log", () => {
    const text = formatProposalReview({
      summary: "Note",
      cited: [],
    });
    expect(text).toContain(NO_CITED_EVIDENCE);
    expect(text).not.toContain("Read before this proposal");
  });
});
