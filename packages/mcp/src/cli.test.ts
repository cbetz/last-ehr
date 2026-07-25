import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "./cli.js";
import { MCP_SERVER_VERSION } from "./server.js";

describe("MCP CLI metadata flags", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["--version", "-v"])("prints the package version for %s", async (flag) => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runCli([flag], {});

    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(`${MCP_SERVER_VERSION}\n`);
  });

  it("documents the version flag in help", async () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runCli(["--help"], {});

    expect(write.mock.calls[0]?.[0]).toContain("@lastehr/mcp --version");
  });
});
