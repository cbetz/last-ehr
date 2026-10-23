import { describe, expect, it, vi } from "vitest";

// A different release (including a prerelease) proves setup follows the
// executable's version source rather than a hardcoded current release.
vi.mock("./server.js", () => ({ MCP_SERVER_VERSION: "9.8.7-test.1" }));

import { renderInit } from "./init.js";

describe("MCP setup output", () => {
  it("generates a safe JSON server configuration by default", () => {
    const config = JSON.parse(renderInit());
    expect(config.mcpServers.lastehr.command).toBe("npx");
    expect(config.mcpServers.lastehr.args).toEqual(["-y", "@lastehr/mcp@9.8.7-test.1"]);
    expect(config.mcpServers.lastehr.env.MEDPLUM_ACCESS_TOKEN).toContain(
      "least-privilege",
    );
  });

  it("generates the Claude Code registration command without enabling writes", () => {
    const command = renderInit("claude-code");
    // The registration command itself must never carry a write flag; the
    // accompanying comment describes the opt-in without setting it.
    const commandLine = command
      .split("\n")
      .find((line) => line.startsWith("claude mcp add"));
    expect(commandLine).toBe("claude mcp add lastehr -- npx -y @lastehr/mcp@9.8.7-test.1");
    expect(commandLine).not.toContain("LASTEHR_MCP_WRITES");
    expect(command).toContain(
      "read-only unless LASTEHR_MCP_WRITES=proposal is set",
    );
  });

  it("declares Cursor's stdio transport without changing the portable JSON format", () => {
    const cursor = JSON.parse(renderInit("cursor")).mcpServers.lastehr;
    const portable = JSON.parse(renderInit("json")).mcpServers.lastehr;
    expect(cursor.type).toBe("stdio");
    expect(cursor.command).toBe(portable.command);
    expect(cursor.args).toEqual(portable.args);
    expect(cursor.args).toEqual(["-y", "@lastehr/mcp@9.8.7-test.1"]);
    expect(portable).not.toHaveProperty("type");
    expect(cursor.env).not.toHaveProperty("LASTEHR_MCP_WRITES");
  });
});
