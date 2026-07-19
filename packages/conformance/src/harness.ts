import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

/**
 * The scripted reviewer: each conformance scenario answers the
 * implementation's elicitation exactly one way. Probing chart state
 * INSIDE the reviewer (while the proposal is pending) is how the suite
 * proves nothing persisted before a decision existed.
 */
export type ElicitationRequest = {
  message: string;
  requestedSchema: {
    type?: string;
    properties?: Record<string, { type?: string }>;
    required?: string[];
  };
};

export type ScriptedReviewer = (
  request: ElicitationRequest,
) => Promise<
  | { action: "accept"; content: Record<string, boolean> }
  | { action: "decline" }
  | { action: "cancel" }
>;

export type ToolCallResult = {
  isError: boolean;
  text: string;
};

export type McpConnection = {
  listToolNames(): Promise<string[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
  /** Every elicitation the server sent over this connection, in order. */
  elicitations: ElicitationRequest[];
  close(): Promise<void>;
};

export type ConnectOptions = {
  elicitation: boolean;
  reviewer?: ScriptedReviewer;
};

/**
 * One conformance scenario = one fresh connection (and, for stdio, a fresh
 * server process): scenarios must not leak reviewer state into each other.
 */
export type Connector = (options: ConnectOptions) => Promise<McpConnection>;

export async function connectClient(
  transport: Transport,
  options: ConnectOptions,
): Promise<McpConnection> {
  const elicitations: ElicitationRequest[] = [];
  const client = new Client(
    { name: "awp-conformance", version: "0.1.0" },
    { capabilities: options.elicitation ? { elicitation: {} } : {} },
  );
  if (options.elicitation) {
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      // URL-mode elicitation carries no schema; the decision-shape check
      // treats an empty properties object as a failure, which is right —
      // a URL-mode exchange is not a boolean decision request.
      const requestedSchema =
        "requestedSchema" in request.params
          ? (request.params
              .requestedSchema as ElicitationRequest["requestedSchema"])
          : {};
      const observed: ElicitationRequest = {
        message: request.params.message,
        requestedSchema,
      };
      elicitations.push(observed);
      if (!options.reviewer) return { action: "decline" };
      return options.reviewer(observed);
    });
  }
  await client.connect(transport);
  return {
    elicitations,
    async listToolNames() {
      const { tools } = await client.listTools();
      return tools.map((tool) => tool.name);
    },
    async callTool(name, args) {
      const result = (await client.callTool(
        { name, arguments: args },
        undefined,
        // Reviewer deliberation is human-shaped even when scripted; the
        // per-call probe reads inside the handler can be slow on remote
        // stores.
        { timeout: 120_000 },
      )) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
      const text =
        result.content?.find((part) => part.type === "text")?.text ?? "";
      return { isError: Boolean(result.isError), text };
    },
    async close() {
      await client.close();
    },
  };
}

/**
 * Spawn the implementer's server command per connection. The command runs
 * through the platform shell so implementers can pass exactly what they
 * run by hand ("node dist/server.js", "npx -y @lastehr/mcp", ...). stdout
 * is the JSON-RPC channel; the child inherits the caller's environment.
 *
 * Closing a connection signals the shell child; a compound command
 * (pipelines, backgrounded processes) can leave grandchildren running —
 * prefer a command that execs a single server process.
 */
export function createStdioConnector(serverCommand: string): Connector {
  const shell =
    process.platform === "win32"
      ? { command: "cmd.exe", args: ["/c", serverCommand] }
      : { command: "/bin/sh", args: ["-c", serverCommand] };
  return async (options) => {
    const transport = new StdioClientTransport({
      command: shell.command,
      args: shell.args,
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
      stderr: "inherit",
    });
    return connectClient(transport, options);
  };
}
