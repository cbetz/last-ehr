import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  clientSupportsApproval,
  createElicitationApproval,
} from "./approval.js";
import {
  loadMcpConfig,
  McpConfigurationError,
  type McpRuntimeConfig,
} from "./config.js";
import { HapiReadClient } from "./hapi.js";
import { createMedplumClient } from "./medplum.js";
import {
  createReadTools,
  type McpReadTool,
  type FhirReadClient,
} from "./read-tools.js";
import {
  createWriteTools,
  type FhirWriteClient,
  type McpWriteTool,
} from "./write-tools.js";

export const MCP_SERVER_VERSION = "0.2.0";

export type McpServerOptions = {
  /**
   * The published package keeps its stable `lastehr` identity. Checkout-only
   * evaluation servers can supply a distinct identity so a client cannot
   * mistake a synthetic lab for the Medplum package.
   */
  name?: string;
  version?: string;
  instructions?: string;
  /**
   * Proposal-shaped write tools, built lazily against the live server so
   * they can ride its approval transport. They are offered ONLY when the
   * connected client declared the elicitation capability — a host that
   * cannot render the approval never sees a write tool (fail closed).
   */
  writeTools?: (server: Server) => McpWriteTool[];
};

type McpCallResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

function toToolDefinition(tool: McpReadTool | McpWriteTool) {
  const proposesWrite = "proposesWrite" in tool && tool.proposesWrite;
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.inputSchema) as {
      [key: string]: unknown;
      type: "object";
    },
    // Write proposals are not destructive (create-only, human-approved) but
    // must never carry the read-only hint.
    annotations: proposesWrite
      ? { readOnlyHint: false, destructiveHint: false }
      : { readOnlyHint: true },
  };
}

export function listMcpTools(tools: Array<McpReadTool | McpWriteTool>) {
  return tools.map(toToolDefinition);
}

export async function callMcpTool(
  tools: Array<McpReadTool | McpWriteTool>,
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
          text: "The FHIR request could not be completed. Verify the backend access policy and server configuration.",
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
        "Read-only FHIR chart tools over the configured FHIR backend. Search for a patient before opening a chart, and treat all returned chart data as sensitive.",
    },
  );

  // Resolved per request, after initialization, so the capability gate sees
  // what the connected client actually declared.
  const availableTools = (): Array<McpReadTool | McpWriteTool> =>
    options.writeTools && clientSupportsApproval(server)
      ? [...tools, ...options.writeTools(server)]
      : tools;

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listMcpTools(availableTools()),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callMcpTool(availableTools(), request.params.name, request.params.arguments),
  );

  return server;
}

export type StartedMcpServer = {
  config: McpRuntimeConfig;
  server: Server;
  tools: McpReadTool[];
};

// Returns the full write-capable surface; the read-only policy simply never
// constructs write tools over it. Typed as FhirWriteClient so tsc enforces
// that both built-in backends actually satisfy the create contract.
async function createBackendClient(
  config: McpRuntimeConfig,
): Promise<FhirWriteClient> {
  if (config.backend === "hapi") {
    // Local, no-auth synthetic evaluation stack; the URL was validated by
    // loadMcpConfig and the same local-only caveats as the web app apply.
    return new HapiReadClient(config.baseUrl as string);
  }
  return createMedplumClient(config);
}

export async function startMcpServer({
  env = process.env,
  client,
}: {
  env?: NodeJS.ProcessEnv;
  client?: FhirReadClient;
} = {}): Promise<StartedMcpServer> {
  const config = loadMcpConfig(env);
  const backendClient = client ?? (await createBackendClient(config));
  if (
    config.writePolicy === "proposal" &&
    typeof (backendClient as Partial<FhirWriteClient>).createResource !==
      "function"
  ) {
    // Fail at startup, not after a human approves: an injected read-only
    // client cannot serve proposal writes.
    throw new McpConfigurationError(
      "LASTEHR_MCP_WRITES=proposal requires a write-capable backend client (createResource).",
    );
  }
  const tools = createReadTools(backendClient);
  const server = createMcpServer(tools, {
    writeTools:
      config.writePolicy === "proposal"
        ? (liveServer) =>
            createWriteTools(
              backendClient as FhirWriteClient,
              createElicitationApproval(liveServer),
              { emitProvenance: config.writeProvenance },
            )
        : undefined,
  });

  await server.connect(new StdioServerTransport());
  // stdout is reserved for JSON-RPC. Keep lifecycle messages on stderr.
  console.error(
    config.writePolicy === "proposal"
      ? `Last EHR MCP server ready: ${tools.length} read-only tools, plus elicitation-gated write proposals when the client supports approvals.`
      : `Last EHR MCP server ready: ${tools.length} read-only tools.`,
  );

  return { config, server, tools };
}
