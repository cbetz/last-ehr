import { MCP_SERVER_VERSION } from "./server.js";

export type McpClient = "json" | "claude-code" | "cursor";

const packageSpecifier = `@lastehr/mcp@${MCP_SERVER_VERSION}`;

const mcpConfig = {
  mcpServers: {
    lastehr: {
      command: "npx",
      args: ["-y", packageSpecifier],
      env: {
        MEDPLUM_ACCESS_TOKEN: "<replace-with-a-least-privilege-token>",
      },
    },
  },
};

export function renderInit(client: McpClient = "json"): string {
  if (client === "claude-code") {
    return [
      "# The process inherits MEDPLUM_* variables from your shell or MCP client configuration.",
      "# @lastehr/mcp is read-only unless LASTEHR_MCP_WRITES=proposal is set",
      "# (writes are then elicitation-gated and human-approved per action).",
      `claude mcp add lastehr -- npx -y ${packageSpecifier}`,
      "",
    ].join("\n");
  }

  const config = client === "cursor"
    ? { mcpServers: { lastehr: { type: "stdio", ...mcpConfig.mcpServers.lastehr } } }
    : mcpConfig;
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function isMcpClient(value: string): value is McpClient {
  return value === "json" || value === "claude-code" || value === "cursor";
}
