import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { createElicitationApproval, createElicitationForm } from "./approval.js";
import {
  batchDecisionSchema,
  ProposalInbox,
  resolveBatchDecisions,
  schemaOffersApproveAll,
  type HeldInput,
} from "./batch-review.js";
import { MemoryFhirClient } from "./memory.js";
import { createMcpServer } from "./server.js";
import { createReadTools } from "./read-tools.js";
import { createWriteTools, MCP_WRITE_TAG, AIAST_LABEL } from "./write-tools.js";

function textOf(result: unknown): string {
  const content =
    result && typeof result === "object" && "content" in result && Array.isArray(result.content)
      ? result.content
      : [];
  const first = content[0] as { text?: string } | undefined;
  return first?.text ?? "";
}

describe("batch decision parsing", () => {
  const ids = ["p1", "p2", "p3"];

  it("keeps an undecided item out of the decision map", () => {
    const resolved = resolveBatchDecisions(ids, {
      decision_p1: "approve",
      decision_p2: "decline",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.decisions.get("p1")).toBe("approve");
    expect(resolved.decisions.get("p2")).toBe("decline");
    expect(resolved.decisions.has("p3")).toBe(false);
  });

  it("rejects an approve-all payload and does not read the other fields as approval", () => {
    const resolved = resolveBatchDecisions(ids, {
      approveAll: true,
      decision_p1: "approve",
    });
    expect(resolved.ok).toBe(false);
    const dashed = resolveBatchDecisions(ids, { "approve-all": true });
    expect(dashed.ok).toBe(false);
  });

  it("lets decline-all fill only the items left unset", () => {
    const resolved = resolveBatchDecisions(ids, {
      declineAll: true,
      decision_p1: "approve",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.decisions.get("p1")).toBe("approve");
    expect(resolved.decisions.get("p2")).toBe("decline");
    expect(resolved.decisions.get("p3")).toBe("decline");
  });

  it("builds a form with one field per proposal and no approve-all control", () => {
    const schema = batchDecisionSchema([
      { id: "p1", title: "Add this note to the chart?", patientId: "p1" },
      { id: "p2", title: "Create this task?", patientId: "p2" },
    ]);
    expect(schemaOffersApproveAll(schema)).toBe(false);
    expect(Object.keys(schema.properties).sort()).toEqual([
      "decision_p1",
      "decision_p2",
      "declineAll",
    ]);
    expect(schema.properties.decision_p1?.enum).toEqual(["approve", "decline"]);
    expect(JSON.stringify(schema)).not.toMatch(/approve[-_\s]?all/i);
    expect(schema.required).toEqual([]);
  });
});

describe("batch apply", () => {
  function held(commit: HeldInput["commit"], patientId = "p1"): HeldInput {
    return {
      patientId,
      toolName: "add_note",
      resourceType: "Communication",
      title: "Add this note to the chart?",
      summary: "Note",
      uncited: false,
      pins: [],
      commit,
    };
  }

  it("applies a mixed batch and leaves the undecided proposal pending", async () => {
    const inbox = new ProposalInbox();
    const saved: string[] = [];
    const approveId = inbox.hold(held(async () => {
      saved.push("note");
      return { saved: true, resourceType: "Communication", id: "note-1" };
    }));
    const declineId = inbox.hold(held(async () => {
      saved.push("should-not-run");
      return { saved: true, id: "nope" };
    }));
    const pendingId = inbox.hold(held(async () => ({ saved: true, id: "later" })));
    const result = await inbox.apply(
      new Map([
        [approveId, "approve"],
        [declineId, "decline"],
      ]),
    );
    expect(saved).toEqual(["note"]);
    expect(result.results).toEqual([
      expect.objectContaining({ id: approveId, decision: "approve", saved: true, resourceId: "note-1" }),
      expect.objectContaining({ id: declineId, decision: "decline", saved: false }),
    ]);
    expect(result.pending).toEqual([pendingId]);
    expect(inbox.pendingIds()).toEqual([pendingId]);
  });

  it("reports a failed item and still applies the next one", async () => {
    const inbox = new ProposalInbox();
    const first = inbox.hold(held(async () => {
      throw new Error("backend exploded");
    }));
    const second = inbox.hold(held(async () => ({ saved: true, resourceType: "Task", id: "task-1" })));
    const result = await inbox.apply(
      new Map([
        [first, "approve"],
        [second, "approve"],
      ]),
    );
    expect(result.results.map((item) => item.saved)).toEqual([false, true]);
    expect(result.results[1]).toMatchObject({ resourceId: "task-1" });
    expect(result.pending).toEqual([]);
  });
});

describe("MCP batch review", () => {
  async function session() {
    const fhir = new MemoryFhirClient();
    const heart = await fhir.createResource({
      resourceType: "Observation",
      status: "final",
      code: { text: "Heart rate" },
      subject: { reference: "Patient/p1" },
      valueQuantity: { value: 70, unit: "/min" },
    });
    const pressure = await fhir.createResource({
      resourceType: "Observation",
      status: "final",
      code: { text: "Systolic blood pressure" },
      subject: { reference: "Patient/p1" },
      valueQuantity: { value: 120, unit: "mmHg" },
    });
    const prompts: Array<{ message: string; properties: string[] }> = [];
    const server = createMcpServer(createReadTools(fhir), {
      writeTools: (live) =>
        createWriteTools(fhir, createElicitationApproval(live), {
          requestForm: createElicitationForm(live),
        }),
    });
    const mcp = new Client(
      { name: "batch-review-test", version: "0" },
      { capabilities: { elicitation: {} } },
    );
    let answer: (schemaKeys: string[]) => Record<string, unknown> = () => ({});
    mcp.setRequestHandler(ElicitRequestSchema, async (request) => {
      const params = request.params as {
        message: string;
        requestedSchema?: { properties?: Record<string, unknown> };
      };
      const properties = Object.keys(params.requestedSchema?.properties ?? {});
      prompts.push({ message: params.message, properties });
      if (properties.includes("approve") && properties.length === 1) {
        return { action: "accept" as const, content: { approve: true } };
      }
      return { action: "accept" as const, content: answer(properties) };
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
    return { fhir, mcp, prompts, heart, pressure, setAnswer: (next: typeof answer) => {
      answer = next;
    } };
  }

  async function call(mcp: Client, name: string, args: Record<string, unknown>) {
    const result = await mcp.callTool({ name, arguments: args });
    return JSON.parse(textOf(result)) as Record<string, unknown>;
  }

  it("approves one held proposal, declines another, and leaves the third pending", async () => {
    const { fhir, mcp, prompts, heart, setAnswer } = await session();
    const cite = (id: string) => ({
      evidence: [{ reference: `Observation/${id}`, reason: "Read earlier in this session." }],
    });
    const note = await call(mcp, "add_note", {
      patientId: "p1",
      text: "Heart rate reviewed.",
      holdForReview: true,
      ...cite(heart.id),
    });
    const task = await call(mcp, "create_task", {
      patientId: "p1",
      description: "Repeat the blood pressure.",
      holdForReview: true,
      ...cite(heart.id),
    });
    const later = await call(mcp, "add_note", {
      patientId: "p2",
      text: "Still waiting.",
      holdForReview: true,
    });
    expect(note).toMatchObject({ saved: false, pending: true });
    expect(task).toMatchObject({ saved: false, pending: true });
    expect(later).toMatchObject({ saved: false, pending: true, proposalId: "p3" });
    expect(prompts).toHaveLength(0);

    const listed = await call(mcp, "list_pending_proposals", {});
    expect(listed.pending).toBe(3);
    const groups = listed.groups as Array<{ patient: string; proposals: Array<{ uncited: boolean; summary: string }> }>;
    expect(groups.map((group) => group.patient).sort()).toEqual(["Patient/p1", "Patient/p2"]);
    const p1 = groups.find((group) => group.patient === "Patient/p1");
    expect(p1?.proposals.some((item) => item.summary.includes("Heart rate reviewed."))).toBe(true);
    expect(p1?.proposals.every((item) => item.uncited === false)).toBe(true);
    const p2 = groups.find((group) => group.patient === "Patient/p2");
    expect(p2?.proposals[0]?.uncited).toBe(true);
    expect(JSON.stringify(listed)).toMatch(/No cited evidence|Uncited/);

    setAnswer(() => ({
      decision_p1: "approve",
      decision_p2: "decline",
    }));
    const reviewed = await call(mcp, "review_pending_proposals", {});
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.properties).toEqual(
      expect.arrayContaining(["decision_p1", "decision_p2", "decision_p3", "declineAll"]),
    );
    expect(prompts[0]?.properties.join(" ")).not.toMatch(/approve[-_\s]?all/i);
    expect(prompts[0]?.message).toContain("Heart rate reviewed.");
    expect(reviewed.results).toEqual([
      expect.objectContaining({ id: "p1", decision: "approve", saved: true }),
      expect.objectContaining({ id: "p2", decision: "decline", saved: false }),
    ]);
    expect(reviewed.pending).toEqual(["p3"]);

    const notes = await fhir.searchResources("Communication", {});
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      payload: [{ contentString: "Heart rate reviewed." }],
      meta: { tag: [MCP_WRITE_TAG], security: [AIAST_LABEL] },
    });
    expect(JSON.stringify(notes[0])).not.toContain("Read earlier");
    const tasks = await fhir.searchResources("Task", {});
    expect(tasks).toHaveLength(0);

    const again = await call(mcp, "list_pending_proposals", {});
    expect(again.pending).toBe(1);
  });

  it("does not save the other proposal when one cited version changed", async () => {
    const { fhir, mcp, heart, pressure, setAnswer } = await session();
    const cite = (id: string) => ({
      evidence: [{ reference: `Observation/${id}`, reason: "Chart row." }],
    });
    await call(mcp, "add_note", {
      patientId: "p1",
      text: "Heart rate note.",
      holdForReview: true,
      ...cite(heart.id),
    });
    await call(mcp, "add_note", {
      patientId: "p1",
      text: "Pressure note.",
      holdForReview: true,
      ...cite(pressure.id),
    });
    await fhir.deleteResource("Observation", heart.id);
    await fhir.createResource({
      ...heart,
      id: heart.id,
      valueQuantity: { value: 71, unit: "/min" },
    });
    setAnswer(() => ({ decision_p1: "approve", decision_p2: "approve" }));
    const reviewed = await call(mcp, "review_pending_proposals", {});
    const results = reviewed.results as Array<{ id: string; saved: boolean; outcome?: string }>;
    expect(results.find((item) => item.id === "p1")).toMatchObject({ saved: false });
    expect(results.find((item) => item.id === "p1")?.outcome).toContain(`Observation/${heart.id}`);
    expect(results.find((item) => item.id === "p2")).toMatchObject({ saved: true });
    const notes = await fhir.searchResources("Communication", {});
    expect(notes.map((note) => note.payload?.[0]?.contentString)).toEqual(["Pressure note."]);
  });

  it("refuses an approve-all tool argument and an approve-all form without saving", async () => {
    const { fhir, mcp, setAnswer } = await session();
    await call(mcp, "add_note", {
      patientId: "p1",
      text: "Held.",
      holdForReview: true,
    });
    const rejected = await mcp.callTool({
      name: "review_pending_proposals",
      arguments: { approveAll: true },
    });
    expect(rejected.isError).toBe(true);
    expect(textOf(rejected)).toContain("Invalid input");
    expect(await fhir.searchResources("Communication", {})).toHaveLength(0);

    setAnswer(() => ({ approveAll: true, decision_p1: "approve" }));
    const reviewed = await call(mcp, "review_pending_proposals", {});
    expect(reviewed.submitted).toBe(false);
    expect(reviewed.saved).toBe(false);
    expect(reviewed.pending).toEqual(["p1"]);
    expect(await fhir.searchResources("Communication", {})).toHaveLength(0);
  });

  it("still asks for a single approval when holdForReview is omitted", async () => {
    const { fhir, mcp, prompts } = await session();
    const saved = await call(mcp, "add_note", { patientId: "p1", text: "One card." });
    expect(saved.saved).toBe(true);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.properties).toEqual(["approve"]);
    expect(await fhir.searchResources("Communication", {})).toHaveLength(1);
    expect((await call(mcp, "list_pending_proposals", {})).pending).toBe(0);
  });
});
