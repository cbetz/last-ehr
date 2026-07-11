import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { loadMcpConfig, type McpRuntimeConfig } from "./config.js";
import { createMedplumClient } from "./medplum.js";
import {
  createReadTools,
  type McpReadTool,
  type MedplumReadClient,
} from "./read-tools.js";

export const MCP_SERVER_VERSION = "0.1.1";

export type McpServerOptions = {
  /**
   * The published package keeps its stable `lastehr` identity. Checkout-only
   * evaluation servers can supply a distinct identity so a client cannot
   * mistake a synthetic lab for the Medplum package.
   */
  name?: string;
  version?: string;
  instructions?: string;
};

type McpCallResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

function toToolDefinition(tool: McpReadTool) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.inputSchema) as {
      [key: string]: unknown;
      type: "object";
    },
    annotations: { readOnlyHint: true },
  };
}

export function listMcpTools(tools: McpReadTool[]) {
  return tools.map(toToolDefinition);
}

export async function callMcpTool(
  tools: McpReadTool[],
  name: string,
  input: unknown,
): Promise<McpCallResult> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  }

  try {
    const parsed = tool.inputSchema.parse(input ?? {});
    const result = await tool.execute(parsed);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isError: true,
        content: [{ type: "text", text: `Invalid input for ${name}.` }],
      };
    }

    if (error instanceof Error && error.message === "Patient not found or not accessible in this session.") {
      return {
        isError: true,
        content: [{ type: "text", text: error.message }],
      };
    }

    // Do not pass backend diagnostics through to an MCP host. A FHIR server
    // may include resource fragments or other sensitive details in an error.
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "The FHIR request could not be completed. Verify the Medplum access policy and server configuration.",
        },
      ],
    };
  }
}

export function createMcpServer(
  tools: McpReadTool[],
  options: McpServerOptions = {},
): Server {
  const server = new Server(
    {
      name: options.name ?? "lastehr",
      version: options.version ?? MCP_SERVER_VERSION,
    },
    {
      capabilities: { tools: {} },
      instructions:
        options.instructions ??
        "Read-only FHIR chart tools over a Medplum project. Search for a patient before opening a chart, and treat all returned chart data as sensitive.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listMcpTools(tools),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callMcpTool(tools, request.params.name, request.params.arguments),
  );

  return server;
}

export type StartedMcpServer = {
  config: McpRuntimeConfig;
  server: Server;
  tools: McpReadTool[];
};

export async function startMcpServer({
  env = process.env,
  client,
}: {
  env?: NodeJS.ProcessEnv;
  client?: MedplumReadClient;
} = {}): Promise<StartedMcpServer> {
  const config = loadMcpConfig(env);
  const medplum = client ?? (await createMedplumClient(config));
  const tools = createReadTools(medplum);
  const server = createMcpServer(tools);

  await server.connect(new StdioServerTransport());
  // stdout is reserved for JSON-RPC. Keep lifecycle messages on stderr.
  console.error(
    `Last EHR MCP server ready: ${tools.length} read-only tools.`,
  );

  return { config, server, tools };
}
