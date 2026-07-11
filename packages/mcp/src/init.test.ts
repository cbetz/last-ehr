import { describe, expect, it } from "vitest";

import { renderInit } from "./init.js";

describe("MCP setup output", () => {
  it("generates a safe JSON server configuration by default", () => {
    const config = JSON.parse(renderInit());
    expect(config.mcpServers.lastehr.command).toBe("npx");
    expect(config.mcpServers.lastehr.args).toEqual(["-y", "@lastehr/mcp"]);
    expect(config.mcpServers.lastehr.env.MEDPLUM_ACCESS_TOKEN).toContain(
      "least-privilege",
    );
  });

  it("generates the Claude Code registration command without write flags", () => {
    const command = renderInit("claude-code");
    expect(command).toContain("claude mcp add lastehr -- npx -y @lastehr/mcp");
    expect(command).not.toContain("WRITE");
  });
});
