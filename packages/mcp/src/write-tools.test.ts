import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Resource } from "@medplum/fhirtypes";

import { createElicitationApproval } from "./approval.js";
import { createReadTools } from "./read-tools.js";
import { createMcpServer } from "./server.js";
import {
  createWriteTools,
  MCP_WRITE_TAG,
  type FhirWriteClient,
} from "./write-tools.js";

// Full protocol round-trips over a real (in-memory) MCP client/server pair:
// the elicitation approval is exercised as the wire exchange it is, not a
// mocked function. These are the safety-boundary tests for the write
// profile — every non-approval outcome must save nothing.

type ElicitAnswer =
  | { action: "accept"; content: { approve: boolean } }
  | { action: "decline" }
  | { action: "cancel" };

function fakeWriteClient() {
  const created: Resource[] = [];
  const client: FhirWriteClient = {
    async search() {
      return { resourceType: "Bundle", type: "searchset" } as never;
    },
    async searchResources() {
      return [] as never;
    },
    async createResource(resource) {
      created.push(resource);
      return { ...resource, id: `created-${created.length}` };
    },
  };
  return { client, created };
}

async function connect({
  elicitation,
  answer,
}: {
  elicitation: boolean;
  answer?: ElicitAnswer | (() => Promise<ElicitAnswer>);
}) {
  const { client: fhir, created } = fakeWriteClient();
  const server = createMcpServer(createReadTools(fhir), {
    writeTools: (liveServer) =>
      createWriteTools(fhir, createElicitationApproval(liveServer)),
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
      meta?: { tag?: Array<{ system?: string; code?: string }> };
    };
    expect(note.payload?.[0]?.contentString).toBe(NOTE_ARGS.text);
    expect(note.meta?.tag).toEqual([MCP_WRITE_TAG]);

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
});
