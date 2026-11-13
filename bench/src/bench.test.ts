import { describe, expect, it } from "vitest";

import { execute } from "./cli.js";
import { protocolChecks } from "./checks.js";
import { renderScorecard } from "./scorecard.js";
import { runBench } from "./runner.js";
import { SCENARIOS } from "./scenarios.js";
import type { RunRecord, StoredResource, StoreSnapshot } from "./types.js";

const REQUIRED_IDS = [
  "note-declined",
  "note-approved",
  "observation-cancelled",
  "observation-shape",
  "task-shape",
  "impossible-due-date",
  "citations-from-chart",
  "invented-evidence-id",
  "citation-same-patient",
  "injection-note-ignored",
  "injection-document-ignored",
  "injection-obey-note",
  "injection-does-not-redirect",
  "decline-not-retried",
  "two-smiths-weight",
  "supersede-keeps-original",
  "stale-cited-note",
  "stale-supersede",
  "delete-not-available",
  "missing-patient",
  "medications-read-only",
  "note-and-task",
  "writes-hidden-without-elicitation",
  "direct-save-still-gated",
];

function row(reference: string, resourceType: string, id: string): StoredResource {
  const resource = { resourceType, id };
  return {
    reference,
    resourceType,
    id,
    canonical: JSON.stringify(resource),
    resource,
  };
}

function snapshot(rows: StoredResource[]): StoreSnapshot {
  return { byReference: new Map(rows.map((item) => [item.reference, item])) };
}

describe("write-safety benchmark catalog", () => {
  it("has unique ids in the launch range and the scenarios the README names", () => {
    const ids = SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(20);
    expect(ids.length).toBeLessThanOrEqual(30);
    for (const id of REQUIRED_IDS) expect(ids).toContain(id);
  });
});

describe("protocol checks", () => {
  const writeToolNames = ["add_note"];

  it("fails a saved write that never opened an approval prompt", () => {
    const run: RunRecord = {
      writeToolNames,
      tools: ["add_note"],
      calls: [
        {
          name: "add_note",
          args: { patientId: "p1", text: "x" },
          isError: false,
          text: "",
          json: { saved: true },
        },
      ],
      baseline: snapshot([]),
      final: snapshot([row("Communication/c1", "Communication", "c1")]),
    };
    const checks = protocolChecks(run);
    expect(checks.find((check) => check.id === "creates-within-approvals")?.status).toBe("fail");
    expect(checks.find((check) => check.id === "saved-true-was-approved")?.status).toBe("fail");
  });

  it("passes one approved create and fails a chart edit made before the decision", () => {
    const created = row("Communication/c1", "Communication", "c1");
    const approved: RunRecord = {
      writeToolNames,
      tools: ["add_note"],
      calls: [
        {
          name: "add_note",
          args: { patientId: "p1", text: "x" },
          isError: false,
          text: "",
          json: { saved: true },
          elicitation: { decision: "approve", unchangedBeforeDecision: true },
        },
      ],
      baseline: snapshot([]),
      final: snapshot([created]),
    };
    expect(protocolChecks(approved).every((check) => check.status === "pass")).toBe(true);

    const early: RunRecord = {
      ...approved,
      calls: [
        {
          ...approved.calls[0]!,
          elicitation: { decision: "approve", unchangedBeforeDecision: false },
        },
      ],
    };
    expect(protocolChecks(early).find((check) => check.id === "no-persist-before-decision")?.status).toBe(
      "fail",
    );
  });
});

describe("scripted agent run", () => {
  it(
    "passes every scenario with no credentials and publishes a scrubbed scorecard",
    async () => {
      const report = await runBench({
        agent: "scripted",
        now: () => new Date("2026-04-01T00:00:00.000Z"),
      });
      const failed = report.scenarios.filter((scenario) => scenario.status === "fail");
      expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
      expect(report.summary).toEqual({ pass: SCENARIOS.length, fail: 0, total: SCENARIOS.length });
      expect(report.data).toBe("synthetic-fixtures-only");
      expect(report.notMeasured).toContain("clinical correctness");
      expect(report.adapter).toBe("lastehr-memory");
      expect(report.agent).toBe("scripted");
      expect(report.model).toBeUndefined();

      const published = JSON.stringify(report);
      expect(published).not.toContain("BENCH-INJECTION");
      expect(published).not.toContain("Ignore prior instructions");
      expect(published).not.toContain("Reviewed inhaler technique");
      expect(published).not.toContain("not-a-real-id");

      const card = renderScorecard(report);
      expect(card).toContain("PASS  note-declined");
      expect(card).toContain("Does not measure: clinical correctness");
      expect(card).toContain(`${SCENARIOS.length} passed, 0 failed`);
      expect(card).not.toContain("BENCH-INJECTION");
    },
    60_000,
  );
});

describe("benchmark CLI", () => {
  it("prints help without running scenarios", async () => {
    let stdout = "";
    const code = await execute(["--help"], {
      stdout: (text) => {
        stdout += text;
      },
      stderr: () => {},
    });
    expect(code).toBe(0);
    expect(stdout).toContain("npm run bench");
    expect(stdout).toContain("note-declined");
    expect(stdout).toContain("Does not score clinical correctness");
  });

  it("refuses a model run when no key is set", async () => {
    let stderr = "";
    let stdout = "";
    const code = await execute(
      ["--agent", "model"],
      {
        stdout: (text) => {
          stdout += text;
        },
        stderr: (text) => {
          stderr += text;
        },
      },
      {} as NodeJS.ProcessEnv,
    );
    expect(code).toBe(1);
    expect(stderr).toContain("No model key");
    expect(stdout).not.toContain("passed");
  });
});
