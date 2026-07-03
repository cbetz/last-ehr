import { config as loadEnv } from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MedplumClient } from "@medplum/core";
import { z } from "zod";

import { buildTools } from "../lib/ai/tools";
import { MedplumBackend } from "../lib/fhir/medplum";

// The same four FHIR tools the web agent uses, exposed over MCP (stdio) so
// Claude Desktop, Claude Code, or any MCP client can work a chart against
// your Medplum project.
//
// There is no approval card here: the MCP client's own tool-use prompt is the
// only gate. The server therefore starts READ-ONLY (search_patients,
// show_patient_info). Set LASTEHR_MCP_WRITES=true to also expose add_note and
// record_observation, and treat every approved call as a direct chart write.
//
// Auth mirrors the seed script: MEDPLUM_ACCESS_TOKEN, or MEDPLUM_CLIENT_ID +
// MEDPLUM_CLIENT_SECRET (client-credentials login, renewed by the client).
// MEDPLUM_BASE_URL selects a self-hosted Medplum; unset means the hosted API.

// Load .env.local then .env for `npm run mcp` from a checkout. MCP hosts that
// pass env in their server config just skip these. Real env always wins.
// quiet is required: dotenv's banner goes to stdout, which is the protocol
// channel for a stdio MCP server and must carry nothing but JSON-RPC.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const WRITES_ENABLED = process.env.LASTEHR_MCP_WRITES === "true";

// The subset of the AI SDK tool shape the bridge below relies on.
type BridgedTool = {
  description?: string;
  inputSchema: z.ZodType;
  needsApproval?: boolean;
  execute: (input: unknown, opts: unknown) => Promise<unknown>;
};

async function createBackend(): Promise<MedplumBackend> {
  const baseUrl = process.env.MEDPLUM_BASE_URL || undefined;
  const accessToken = process.env.MEDPLUM_ACCESS_TOKEN;
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;

  if (!accessToken && !(clientId && clientSecret)) {
    console.error(
      "The MCP server needs access to your Medplum project. Set either:\n" +
        "  - MEDPLUM_CLIENT_ID + MEDPLUM_CLIENT_SECRET (a ClientApplication), or\n" +
        "  - MEDPLUM_ACCESS_TOKEN (a token from an account with chart access).",
    );
    process.exit(1);
  }

  const medplum = new MedplumClient({ baseUrl, fetch });
  if (accessToken) {
    medplum.setAccessToken(accessToken);
  } else {
    await medplum.startClientLogin(clientId as string, clientSecret as string);
  }
  return new MedplumBackend(medplum);
}

async function main(): Promise<void> {
  const backend = await createBackend();

  // No sessionId: MCP runs against your own project, not the shared demo, so
  // there is no per-visitor write isolation to apply.
  const tools = buildTools(backend) as unknown as Record<string, BridgedTool>;
  const entries = Object.entries(tools).filter(
    ([, tool]) => WRITES_ENABLED || !tool.needsApproval,
  );

  const server = new Server(
    { name: "lastehr", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "FHIR chart tools over a Medplum project. Reference patients by the " +
        "resource id from a prior search_patients call. Write tools (add_note, " +
        "record_observation) are only present when the server was started " +
        "with LASTEHR_MCP_WRITES=true; every write saves directly to the " +
        "chart, so confirm intent before calling them.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: entries.map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.inputSchema) as {
        [key: string]: unknown;
        type: "object";
      },
      annotations: { readOnlyHint: !tool.needsApproval },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const entry = entries.find(([name]) => name === request.params.name);
    if (!entry) {
      return {
        isError: true,
        content: [
          { type: "text", text: `Unknown tool: ${request.params.name}` },
        ],
      };
    }
    const [, tool] = entry;
    try {
      const input = tool.inputSchema.parse(request.params.arguments ?? {});
      const result = await tool.execute(input, {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: "text", text: message }] };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is the log channel for stdio MCP servers; stdout is the protocol.
  console.error(
    `Last EHR MCP server ready: ${entries.length} tools, writes ${
      WRITES_ENABLED ? "ENABLED" : "disabled (set LASTEHR_MCP_WRITES=true to enable)"
    }.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
