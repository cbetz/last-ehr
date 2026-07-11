export type McpClient = "json" | "claude-code" | "cursor";

const mcpConfig = {
  mcpServers: {
    lastehr: {
      command: "npx",
      args: ["-y", "@lastehr/mcp"],
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
      "# @lastehr/mcp is read-only in 0.1.x.",
      "claude mcp add lastehr -- npx -y @lastehr/mcp",
      "",
    ].join("\n");
  }

  return `${JSON.stringify(mcpConfig, null, 2)}\n`;
}

export function isMcpClient(value: string): value is McpClient {
  return value === "json" || value === "claude-code" || value === "cursor";
}
