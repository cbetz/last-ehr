import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { MCP_SERVER_VERSION } from "./server.js";

// The CLI only auto-runs when it IS the process entry point, so importing it
// for a unit test does not start a server. Getting that check wrong is silent:
// the process exits 0 having printed nothing and started nothing.
//
// npm installs `bin` as a SYMLINK (node_modules/.bin/lastehr-mcp ->
// dist/cli.js), which is the documented `npx -y @lastehr/mcp` path. An
// entry-point check that compares argv[1] to import.meta.url without resolving
// the symlink is false in exactly that case. These tests run the built CLI as a
// real process, both ways, because no in-process test can observe it.

const dist = resolve(import.meta.dirname, "../dist/cli.js");

const run = (bin: string) =>
  execFileSync(process.execPath, [bin, "--version"], { encoding: "utf8" }).trim();

describe("the built CLI actually runs", () => {
  // These exercise the compiled artifact, so they need it to exist. CI runs
  // `npm test` BEFORE `npm run build`, and a contributor may not have built
  // either, so the suite builds on demand rather than depending on step order —
  // skipping instead would make it pass silently in exactly that case.
  beforeAll(() => {
    if (existsSync(dist)) return;
    execFileSync("npm", ["run", "build", "--workspace=@lastehr/mcp"], {
      cwd: resolve(import.meta.dirname, "../../.."),
      stdio: "ignore",
    });
  }, 120_000);

  it("prints the version when executed directly", () => {
    expect(run(dist)).toBe(MCP_SERVER_VERSION);
  });

  it("prints the version when executed through a bin symlink, as npx does", () => {
    const link = join(mkdtempSync(join(tmpdir(), "lastehr-bin-")), "lastehr-mcp");
    symlinkSync(dist, link);
    // Before the realpath fix this returned "" with exit code 0: no server, no
    // error, no output.
    expect(run(link)).toBe(MCP_SERVER_VERSION);
  });
});
