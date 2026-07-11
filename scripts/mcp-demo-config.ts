import { resolve } from "node:path";

export type McpDemoClient = "json" | "claude-code" | "cursor";

export type McpDemoCommand = {
  command: string;
  args: string[];
};

export type McpDemoConfigOptions = {
  repositoryRoot?: string;
  nodePath?: string;
};

/**
 * The local lab must start without `npm run`: npm's lifecycle banner is sent
 * to stdout and would corrupt the JSON-RPC stdio stream. These paths are
 * deliberately absolute so an MCP client does not depend on its own cwd.
 */
export function createMcpDemoCommand({
  repositoryRoot = process.cwd(),
  nodePath = process.execPath,
}: McpDemoConfigOptions = {}): McpDemoCommand {
  const root = resolve(repositoryRoot);

  return {
    command: nodePath,
    args: [
      "--import",
      resolve(root, "node_modules/tsx/dist/loader.mjs"),
      resolve(root, "scripts/mcp-demo.ts"),
      "--serve",
    ],
  };
}

function quoteForShell(value: string): string {
  // JSON string quoting is accepted by the shells documented for Claude Code
  // and correctly preserves checkout paths containing spaces.
  return JSON.stringify(value);
}

export function isMcpDemoClient(value: string): value is McpDemoClient {
  return value === "json" || value === "claude-code" || value === "cursor";
}

export function renderMcpDemoInit(
  client: McpDemoClient = "json",
  options: McpDemoConfigOptions = {},
): string {
  const command = createMcpDemoCommand(options);

  if (client === "claude-code") {
    return [
      "# Checkout-only synthetic HAPI Local Lab. No FHIR credentials or model-provider API key.",
      "# It exposes only read-only fixture data; it is not @lastehr/mcp.",
      [
        "claude",
        "mcp",
        "add",
        "lastehr-synthetic",
        "--scope",
        "local",
        "--",
        command.command,
        ...command.args,
      ]
        .map(quoteForShell)
        .join(" "),
      "",
    ].join("\n");
  }

  return `${JSON.stringify(
    {
      mcpServers: {
        "lastehr-synthetic": command,
      },
    },
    null,
    2,
  )}\n`;
}
