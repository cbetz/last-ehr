import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "./cli.js";
import { MCP_SERVER_VERSION } from "./server.js";

// The metadata flags read no configuration, so an empty env is the point. Cast
// because this repo's ProcessEnv requires NODE_ENV, and the package's own build
// excludes test files so `tsc -p tsconfig.build.json` never sees this file.
const EMPTY_ENV = {} as NodeJS.ProcessEnv;

describe("MCP CLI metadata flags", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["--version", "-v"])("prints the package version for %s", async (flag) => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runCli([flag], EMPTY_ENV);

    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(`${MCP_SERVER_VERSION}\n`);
  });

  it("documents the version flag in help", async () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runCli(["--help"], EMPTY_ENV);

    expect(write.mock.calls[0]?.[0]).toContain("@lastehr/mcp --version");
  });
});
