import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { renderInit } from "../../packages/mcp/src/init.js";

// The README buttons are a copy of `init --demo`, not a second config.
// Cursor's install link carries the server object (name is a query param).
// VS Code's documented install URL carries that same object plus `name`.
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");

function demoCursorServer(): Record<string, unknown> {
  return JSON.parse(renderInit("cursor", "memory")).mcpServers.lastehr;
}

describe("README one-click install", () => {
  it("decodes the Cursor deeplink to the config init --demo prints for Cursor", () => {
    const match = readme.match(
      /https:\/\/cursor\.com\/en\/install-mcp\?name=lastehr&config=([A-Za-z0-9+/=_%-]+)/,
    );
    expect(match).not.toBeNull();
    const decoded = JSON.parse(
      Buffer.from(decodeURIComponent(match![1]), "base64").toString("utf8"),
    );
    expect(decoded).toEqual(demoCursorServer());
  });

  it("decodes the VS Code install link to that same server, plus the server name", () => {
    const match = readme.match(/https:\/\/vscode\.dev\/redirect\?url=([^)\s]+)/);
    expect(match).not.toBeNull();
    const vscodeUrl = decodeURIComponent(match![1]);
    expect(vscodeUrl.startsWith("vscode:mcp/install?")).toBe(true);
    const decoded = JSON.parse(
      decodeURIComponent(vscodeUrl.slice("vscode:mcp/install?".length)),
    ) as { name?: string };
    const { name, ...server } = decoded;
    expect(name).toBe("lastehr");
    expect(server).toEqual(demoCursorServer());
  });

  it("keeps the copy-paste demo lines on init --demo's env without a version pin", () => {
    const generated = renderInit("claude-code", "memory")
      .split("\n")
      .find((line) => line.startsWith("claude mcp add"));
    expect(generated).toBeDefined();
    const unpinned = generated!.replace(/@lastehr\/mcp@\S+/, "@lastehr/mcp");
    expect(unpinned).toContain("--env FHIR_BACKEND=memory");
    expect(unpinned).toContain("--env LASTEHR_MCP_WRITES=proposal");
    expect(unpinned).not.toMatch(/@lastehr\/mcp@/);
    expect(readme).toContain(unpinned);
    expect(readme).toContain("npx -y @lastehr/mcp init --demo");
  });
});
