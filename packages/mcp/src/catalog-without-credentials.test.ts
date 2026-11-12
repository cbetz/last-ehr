import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { buildMcpServer } from "./server.js";
import { READ_TOOL_NAMES } from "./read-tools.js";
import { WRITE_TOOL_NAMES } from "./write-tools.js";

const PLACEHOLDER = "<replace-with-a-least-privilege-token>";
const NOTE = { patientId: "patient-synthetic", text: "Synthetic note. Nothing clinical." };

type ToolResult = { isError?: boolean; content?: unknown };

function textOf(result: unknown): string {
  if (!result || typeof result !== "object" || !("content" in result)) return "";
  const { content } = result;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) =>
      item && typeof item === "object" && "text" in item && typeof item.text === "string"
        ? item.text
        : "",
    )
    .join("\n");
}

async function connect(env: NodeJS.ProcessEnv, elicitation: boolean) {
  const { server } = buildMcpServer({ env });
  const prompts: string[] = [];
  const mcpClient = new Client(
    { name: "catalog-test", version: "0" },
    { capabilities: elicitation ? { elicitation: {} } : {} },
  );
  if (elicitation) {
    mcpClient.setRequestHandler(ElicitRequestSchema, async (request) => {
      prompts.push(request.params.message);
      return { action: "decline" };
    });
  }
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    mcpClient.connect(clientTransport),
  ]);
  return { mcpClient, prompts };
}

describe("tool catalog without a usable Medplum credential", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists every read tool, with schemas and annotations, when nothing is configured", async () => {
    const fetchFn = vi.fn(() => {
      throw new Error("tools/list contacted the network");
    });
    vi.stubGlobal("fetch", fetchFn);
    const { mcpClient } = await connect({} as unknown as NodeJS.ProcessEnv, false);

    const { tools } = await mcpClient.listTools();

    expect(tools.map((tool) => tool.name)).toEqual([...READ_TOOL_NAMES]);
    for (const tool of tools) {
      expect((tool.description ?? "").length).toBeGreaterThan(0);
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(tool.inputSchema).toHaveProperty("properties");
      expect(tool.annotations).toMatchObject({ readOnlyHint: true });
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "no env",
      env: {} as unknown as NodeJS.ProcessEnv,
      needle: "MEDPLUM_ACCESS_TOKEN is missing",
    },
    {
      label: "placeholder token",
      env: { MEDPLUM_ACCESS_TOKEN: PLACEHOLDER } as unknown as NodeJS.ProcessEnv,
      needle: "MEDPLUM_ACCESS_TOKEN is invalid",
    },
  ])("returns a tool error for $label and does not call FHIR", async ({ env, needle }) => {
    const fetchFn = vi.fn(() => {
      throw new Error("tool call contacted the network");
    });
    vi.stubGlobal("fetch", fetchFn);
    const { mcpClient } = await connect(env, false);

    const result = await mcpClient.callTool({
      name: "search_patients",
      arguments: { name: "Ada Lovelace" },
    });

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain(needle);
    expect(text).toContain("npx @lastehr/mcp init");
    expect(text).toContain("npx @lastehr/mcp doctor");
    expect(text).not.toContain(PLACEHOLDER);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("hides write tools from a client that cannot approve", async () => {
    const { mcpClient } = await connect(
      { LASTEHR_MCP_WRITES: "proposal" } as unknown as NodeJS.ProcessEnv,
      false,
    );
    const { tools } = await mcpClient.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([...READ_TOOL_NAMES]);

    const result = await mcpClient.callTool({ name: "add_note", arguments: NOTE });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Unknown tool");
  });

  it("lists write tools for an approval-capable client and refuses the call before approval", async () => {
    const fetchFn = vi.fn(() => {
      throw new Error("write contacted the network");
    });
    vi.stubGlobal("fetch", fetchFn);
    const { mcpClient, prompts } = await connect(
      { LASTEHR_MCP_WRITES: "proposal" } as unknown as NodeJS.ProcessEnv,
      true,
    );

    const { tools } = await mcpClient.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      ...READ_TOOL_NAMES,
      ...WRITE_TOOL_NAMES,
    ]);
    for (const tool of tools) {
      const write = (WRITE_TOOL_NAMES as readonly string[]).includes(tool.name);
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(tool.annotations).toMatchObject(
        write
          ? { readOnlyHint: false, destructiveHint: false }
          : { readOnlyHint: true },
      );
    }

    const result = await mcpClient.callTool({ name: "add_note", arguments: NOTE });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("MEDPLUM_ACCESS_TOKEN is missing");
    expect(prompts).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("still requires approval before a HAPI write, and saves nothing on decline", async () => {
    const fetchFn = vi.fn(() => {
      throw new Error("declined write contacted the network");
    });
    vi.stubGlobal("fetch", fetchFn);
    const { server } = buildMcpServer({
      env: {
        FHIR_BACKEND: "hapi",
        FHIR_BASE_URL: "http://127.0.0.1:9/fhir",
        LASTEHR_MCP_WRITES: "proposal",
      } as unknown as NodeJS.ProcessEnv,
    });
    const prompts: string[] = [];
    const mcpClient = new Client(
      { name: "catalog-test", version: "0" },
      { capabilities: { elicitation: {} } },
    );
    mcpClient.setRequestHandler(ElicitRequestSchema, async (request) => {
      prompts.push(request.params.message);
      return { action: "decline" };
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      mcpClient.connect(clientTransport),
    ]);

    const result = (await mcpClient.callTool({
      name: "add_note",
      arguments: NOTE,
    })) as ToolResult;

    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain("nothing was saved");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Synthetic note. Nothing clinical.");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("still writes to HAPI after an explicit approval", async () => {
    const order: string[] = [];
    const fetchFn = vi.fn(async (_input: unknown, init?: RequestInit) => {
      order.push(init?.method ?? "GET");
      return new Response(
        JSON.stringify({ resourceType: "Communication", id: "note-synthetic" }),
        { status: 201, headers: { "content-type": "application/fhir+json" } },
      );
    });
    vi.stubGlobal("fetch", fetchFn);
    const { server } = buildMcpServer({
      env: {
        FHIR_BACKEND: "hapi",
        FHIR_BASE_URL: "http://127.0.0.1:9/fhir",
        LASTEHR_MCP_WRITES: "proposal",
      } as unknown as NodeJS.ProcessEnv,
    });
    const mcpClient = new Client(
      { name: "catalog-test", version: "0" },
      { capabilities: { elicitation: {} } },
    );
    mcpClient.setRequestHandler(ElicitRequestSchema, async () => {
      order.push("approval");
      return { action: "accept", content: { approve: true } };
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      mcpClient.connect(clientTransport),
    ]);

    const result = await mcpClient.callTool({ name: "add_note", arguments: NOTE });

    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain('"saved": true');
    expect(order[0]).toBe("approval");
    expect(order).toContain("POST");
  });
});
