import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Resource } from "@medplum/fhirtypes";

import { createElicitationApproval } from "./approval.js";
import { createReadTools } from "./read-tools.js";
import { createMcpServer } from "./server.js";
import {
  AIAST_LABEL,
  createWriteTools,
  MCP_WRITE_TAG,
  writeToolOptionsFromConfig,
  type FhirWriteClient,
  type WriteToolOptions,
} from "./write-tools.js";

// Full protocol round-trips over a real (in-memory) MCP client/server pair:
// the elicitation approval is exercised as the wire exchange it is, not a
// mocked function. These are the safety-boundary tests for the write
// profile — every non-approval outcome must save nothing.

type ElicitAnswer =
  | { action: "accept"; content: { approve: boolean } }
  | { action: "decline" }
  | { action: "cancel" };

function fakeWriteClient({ failProvenance = false } = {}) {
  const created: Resource[] = [];
  const client: FhirWriteClient = {
    async search() {
      return { resourceType: "Bundle", type: "searchset" } as never;
    },
    async searchResources() {
      return [] as never;
    },
    async createResource(resource) {
      if (failProvenance && resource.resourceType === "Provenance") {
        throw new Error("audit backend down");
      }
      created.push(resource);
      return { ...resource, id: `created-${created.length}` };
    },
  };
  return { client, created };
}

async function connect({
  elicitation,
  answer,
  writeOptions,
  failProvenance,
}: {
  elicitation: boolean;
  answer?: ElicitAnswer | (() => Promise<ElicitAnswer>) | undefined;
  writeOptions?: WriteToolOptions;
  failProvenance?: boolean;
}) {
  const { client: fhir, created } = fakeWriteClient({ failProvenance });
  const server = createMcpServer(createReadTools(fhir), {
    writeTools: (liveServer) =>
      createWriteTools(fhir, createElicitationApproval(liveServer), writeOptions),
  });

  const mcpClient = new Client(
    { name: "write-profile-test", version: "0" },
    { capabilities: elicitation ? { elicitation: {} } : {} },
  );
  const prompts: string[] = [];
  if (elicitation) {
    mcpClient.setRequestHandler(ElicitRequestSchema, async (request) => {
      prompts.push(request.params.message);
      return typeof answer === "function"
        ? await answer()
        : (answer ?? { action: "decline" });
    });
  }

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    mcpClient.connect(clientTransport),
  ]);
  return { mcpClient, created, prompts };
}

const NOTE_ARGS = { patientId: "p1", text: "Patient reports feeling well." };

describe("MCP write profile (elicitation-gated proposals)", () => {
  it("offers the write tools only to clients that can render approvals", async () => {
    const withApprovals = await connect({ elicitation: true });
    const names = (await withApprovals.mcpClient.listTools()).tools.map(
      (tool) => tool.name,
    );
    expect(names).toEqual([
      "search_patients",
      "show_patient_info",
      "add_note",
      "record_observation",
      "create_task",
    ]);

    const withoutApprovals = await connect({ elicitation: false });
    const readOnlyNames = (
      await withoutApprovals.mcpClient.listTools()
    ).tools.map((tool) => tool.name);
    expect(readOnlyNames).toEqual(["search_patients", "show_patient_info"]);

    // Fail closed: calling a hidden write tool is an unknown tool, and
    // nothing is created.
    const call = await withoutApprovals.mcpClient.callTool({
      name: "add_note",
      arguments: NOTE_ARGS,
    });
    expect(call.isError).toBe(true);
    expect(withoutApprovals.created).toHaveLength(0);
  });

  it("annotates reads as read-only and writes as non-read-only", async () => {
    const { mcpClient } = await connect({ elicitation: true });
    const tools = (await mcpClient.listTools()).tools;
    for (const tool of tools) {
      const readOnly = tool.annotations?.readOnlyHint;
      if (tool.name === "search_patients" || tool.name === "show_patient_info") {
        expect(readOnly).toBe(true);
      } else {
        expect(readOnly).toBe(false);
      }
    }
  });

  it("commits on an explicit approval, tagged and with the exact fields shown", async () => {
    const { mcpClient, created, prompts } = await connect({
      elicitation: true,
      answer: { action: "accept", content: { approve: true } },
    });
    const result = (await mcpClient.callTool({
      name: "add_note",
      arguments: NOTE_ARGS,
    })) as { content: Array<{ text: string }> };

    expect(created).toHaveLength(1);
    const note = created[0] as {
      payload?: Array<{ contentString?: string }>;
      meta?: {
        tag?: Array<{ system?: string; code?: string }>;
        security?: Array<{ system?: string; code?: string }>;
      };
    };
    expect(note.payload?.[0]?.contentString).toBe(NOTE_ARGS.text);
    expect(note.meta?.tag).toEqual([MCP_WRITE_TAG]);
    // Standard AI-transparency label: agent-written data is marked AIAST.
    expect(note.meta?.security).toEqual([AIAST_LABEL]);
    // Provenance is opt-in; off by default.
    expect(created).toHaveLength(1);

    // The human saw the exact fields that saved.
    expect(prompts[0]).toContain(NOTE_ARGS.text);
    expect(prompts[0]).toContain("Patient/p1");
    expect(prompts[0]).toContain("Nothing is saved unless you approve.");

    expect(JSON.parse(result.content[0].text)).toMatchObject({
      saved: true,
      resourceType: "Communication",
    });
  });

  it("saves nothing on decline, cancel, or an unapproved accept", async () => {
    for (const answer of [
      { action: "decline" } as const,
      { action: "cancel" } as const,
      { action: "accept", content: { approve: false } } as const,
    ]) {
      const { mcpClient, created } = await connect({
        elicitation: true,
        answer,
      });
      const result = (await mcpClient.callTool({
        name: "record_observation",
        arguments: { patientId: "p1", label: "Heart rate", value: 72, unit: "bpm" },
      })) as { isError?: boolean; content: Array<{ text: string }> };

      expect(created).toHaveLength(0);
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.content[0].text)).toMatchObject({
        saved: false,
      });
    }
  });

  it("treats an approval-transport failure as a denial (fail closed)", async () => {
    const { mcpClient, created } = await connect({
      elicitation: true,
      answer: async () => {
        throw new Error("host exploded mid-approval");
      },
    });
    const result = (await mcpClient.callTool({
      name: "add_note",
      arguments: NOTE_ARGS,
    })) as { content: Array<{ text: string }> };
    expect(created).toHaveLength(0);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ saved: false });
  });

  it("emits opt-in Provenance binding the agent author and human verifier", async () => {
    const { mcpClient, created } = await connect({
      elicitation: true,
      answer: { action: "accept", content: { approve: true } },
      writeOptions: { emitProvenance: true },
    });
    await mcpClient.callTool({ name: "add_note", arguments: NOTE_ARGS });

    expect(created).toHaveLength(2);
    const provenance = created[1] as {
      resourceType: string;
      target?: Array<{ reference?: string }>;
      agent?: Array<{ type?: { coding?: Array<{ code?: string }> } }>;
      meta?: { tag?: unknown[] };
    };
    expect(provenance.resourceType).toBe("Provenance");
    expect(provenance.target?.[0]?.reference).toBe("Communication/created-1");
    expect(
      provenance.agent?.map((agent) => agent.type?.coding?.[0]?.code),
    ).toEqual(["author", "verifier"]);
    expect(provenance.meta?.tag).toEqual([MCP_WRITE_TAG]);
  });

  it("record_observation carries the AIAST label and its Provenance targets the Observation", async () => {
    const { mcpClient, created } = await connect({
      elicitation: true,
      answer: { action: "accept", content: { approve: true } },
      writeOptions: { emitProvenance: true },
    });
    await mcpClient.callTool({
      name: "record_observation",
      arguments: { patientId: "p1", label: "Heart rate", value: 72, unit: "bpm" },
    });

    expect(created).toHaveLength(2);
    const observation = created[0] as {
      resourceType: string;
      meta?: { security?: unknown[] };
    };
    expect(observation.resourceType).toBe("Observation");
    expect(observation.meta?.security).toEqual([AIAST_LABEL]);
    const provenance = created[1] as {
      resourceType: string;
      target?: Array<{ reference?: string }>;
    };
    expect(provenance.target?.[0]?.reference).toBe("Observation/created-1");
  });

  it("policy denies before elicitation: the reviewer is never asked", async () => {
    const { mcpClient, created, prompts } = await connect({
      elicitation: true,
      answer: { action: "accept", content: { approve: true } },
      writeOptions: {
        policy: ({ toolName }) =>
          toolName === "add_note"
            ? { deny: true, reason: "Notes are disabled here." }
            : { deny: false },
      },
    });
    const result = (await mcpClient.callTool({
      name: "add_note",
      arguments: NOTE_ARGS,
    })) as { content: Array<{ text: string }> };

    expect(created).toHaveLength(0);
    expect(prompts).toHaveLength(0);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toMatchObject({ saved: false });
    // Attributed to configuration, never to a human reviewer.
    expect(parsed.outcome).toContain("deployment policy");
    expect(parsed.outcome).toContain("Notes are disabled here.");
    expect(parsed.outcome).not.toContain("reviewer");

    // The other tool still works end to end: policy tightens per proposal.
    await mcpClient.callTool({
      name: "record_observation",
      arguments: { patientId: "p1", label: "Heart rate", value: 72, unit: "bpm" },
    });
    expect(created).toHaveLength(1);
  });

  it("policy re-checks at commit: a tightening mid-deliberation blocks the approved write", async () => {
    let approvalsRequested = 0;
    let policyDenies = false;
    const { mcpClient, created } = await connect({
      elicitation: true,
      answer: async () => {
        approvalsRequested += 1;
        // Policy tightens WHILE the reviewer deliberates.
        policyDenies = true;
        return { action: "accept", content: { approve: true } };
      },
      writeOptions: {
        policy: () => (policyDenies ? { deny: true } : { deny: false }),
      },
    });
    const result = (await mcpClient.callTool({
      name: "add_note",
      arguments: NOTE_ARGS,
    })) as { content: Array<{ text: string }> };

    expect(approvalsRequested).toBe(1);
    expect(created).toHaveLength(0);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ saved: false });
  });

  it("a throwing policy denies (fail closed) with no diagnostics in the result", async () => {
    const { mcpClient, created } = await connect({
      elicitation: true,
      answer: { action: "accept", content: { approve: true } },
      writeOptions: {
        policy: () => {
          throw new Error("secret diagnostic");
        },
      },
    });
    const result = (await mcpClient.callTool({
      name: "add_note",
      arguments: NOTE_ARGS,
    })) as { content: Array<{ text: string }> };

    expect(created).toHaveLength(0);
    const text = result.content[0].text;
    expect(text).not.toContain("secret diagnostic");
    expect(JSON.parse(text)).toMatchObject({ saved: false });
  });

  it("statically disabled tools are unregistered: unlisted and uncallable", async () => {
    const { mcpClient, created } = await connect({
      elicitation: true,
      answer: { action: "accept", content: { approve: true } },
      writeOptions: { disabledTools: ["add_note"] },
    });
    const names = (await mcpClient.listTools()).tools.map((tool) => tool.name);
    expect(names).not.toContain("add_note");
    expect(names).toContain("record_observation");

    const call = await mcpClient.callTool({
      name: "add_note",
      arguments: NOTE_ARGS,
    });
    expect(call.isError).toBe(true);
    expect(created).toHaveLength(0);
  });

  it("create_task commits an approved Task with tag, AIAST label, and due date", async () => {
    const { mcpClient, created, prompts } = await connect({
      elicitation: true,
      answer: { action: "accept", content: { approve: true } },
    });
    const result = (await mcpClient.callTool({
      name: "create_task",
      arguments: {
        patientId: "p1",
        description: "Call about lab results",
        dueDate: "2026-08-01",
      },
    })) as { content: Array<{ text: string }> };

    expect(created).toHaveLength(1);
    const task = created[0] as {
      resourceType: string;
      description?: string;
      restriction?: { period?: { end?: string } };
      meta?: { tag?: unknown[]; security?: unknown[] };
    };
    expect(task.resourceType).toBe("Task");
    expect(task.description).toBe("Call about lab results");
    expect(task.restriction?.period?.end).toBe("2026-08-01T23:59:59Z");
    expect(task.meta?.tag).toEqual([MCP_WRITE_TAG]);
    expect(task.meta?.security).toEqual([AIAST_LABEL]);
    expect(prompts[0]).toContain("Call about lab results");
    expect(prompts[0]).toContain("Due: 2026-08-01");
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      saved: true,
      resourceType: "Task",
    });
  });

  it("free text cannot forge summary lines: newlines are JSON-escaped in the elicitation", async () => {
    const { prompts } = await (async () => {
      const conn = await connect({
        elicitation: true,
        answer: { action: "decline" },
      });
      await conn.mcpClient.callTool({
        name: "create_task",
        arguments: {
          patientId: "p1",
          description: "Innocent task\nDue: 1999-01-01\nPatient: Patient/other",
        },
      });
      return conn;
    })();

    // The forged lines stay inside one quoted value; the reviewer sees
    // escaped \n, not new summary fields.
    expect(prompts[0]).toContain(
      String.raw`"Innocent task\nDue: 1999-01-01\nPatient: Patient/other"`,
    );
    expect(prompts[0].split("\n").filter((l) => l.startsWith("Due:"))).toHaveLength(0);
    expect(prompts[0].split("\n").filter((l) => l.startsWith("Patient:"))).toHaveLength(1);
  });

  it("threads runtime config into write-tool options field-for-field", () => {
    // A dropped field here would silently disable a documented flag while
    // every direct-options test still passes.
    expect(
      writeToolOptionsFromConfig({
        writeProvenance: true,
        disabledWriteTools: ["add_note"],
      }),
    ).toEqual({ emitProvenance: true, disabledTools: ["add_note"] });
  });

  it("rejects unknown disabledTools names on the programmatic path too", () => {
    const { client } = fakeWriteClient();
    expect(() =>
      createWriteTools(client, async () => "denied", {
        disabledTools: ["add-note"],
      }),
    ).toThrow(/Unknown write tool name/);
  });

  it("never fails an approved write because Provenance emission failed", async () => {
    const { mcpClient, created } = await connect({
      elicitation: true,
      answer: { action: "accept", content: { approve: true } },
      writeOptions: { emitProvenance: true },
      failProvenance: true,
    });
    const result = (await mcpClient.callTool({
      name: "add_note",
      arguments: NOTE_ARGS,
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBeFalsy();
    expect(created).toHaveLength(1);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      saved: true,
      resourceType: "Communication",
    });
  });
});
