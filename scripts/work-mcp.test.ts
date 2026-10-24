import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

import { parseWorkMcpArguments, workMcpLaunchConfig } from "./work-mcp";

const run = promisify(execFile);
type Launch = { command: string; args: string[] };
const launch = () => (workMcpLaunchConfig() as { mcpServers: { "last-work": Launch } }).mcpServers["last-work"];

describe("Work MCP CLI", () => {
  it("prints absolute launch paths without reading or embedding credentials", async () => {
    const config = launch();
    expect(isAbsolute(config.command)).toBe(true);
    expect(config.args[0]).toBe("--import");
    expect(isAbsolute(config.args[1])).toBe(true);
    expect(isAbsolute(config.args[2])).toBe(true);
    expect(config.args.slice(3)).toEqual(["--url", "http://127.0.0.1:3300"]);
    const output = await run(config.command, [...config.args.slice(0, 3), "--print-config"], { env: { NODE_ENV: "test", PATH: process.env.PATH, LASTEHR_WORK_ASSISTANT_KEY: "not-to-be-printed-assistant-secret", LASTEHR_WORK_REVIEWER_KEY: "not-to-be-printed-reviewer-secret", ANTHROPIC_API_KEY: "not-to-be-printed-provider-secret" } });
    expect(JSON.parse(output.stdout)).toEqual(workMcpLaunchConfig());
    expect(output.stdout).not.toContain("not-to-be-printed");
    expect(output.stderr).not.toContain("not-to-be-printed");
  });

  it("rejects unsupported URL forms and unknown arguments without reflecting them", () => {
    for (const url of ["https://127.0.0.1:3300", "http://localhost:3300", "http://127.1:3300", "http://127.0.0.1", "http://127.0.0.1:80", "http://127.0.0.1:3300/api", "http://[::1]:3300", "http://secret@127.0.0.1:3300", "http://127.0.0.1:3300?secret", "http://127.0.0.1:3300#secret"]) {
      expect(() => parseWorkMcpArguments(["--url", url])).toThrow("Invalid configuration.");
    }
    expect(() => parseWorkMcpArguments(["--url"])).toThrow("Invalid arguments.");
    expect(() => parseWorkMcpArguments(["--reviewer-key", "secret"])).toThrow("Invalid arguments.");
    expect(() => parseWorkMcpArguments(["--print-config", "--print-config"])).toThrow("Invalid arguments.");
  });

  it("starts from an unrelated cwd and speaks only MCP on stdout", async () => {
    const directory = await mkdtemp(join(tmpdir(), "last-work-mcp-cwd-"));
    const config = launch();
    const transport = new StdioClientTransport({ command: config.command, args: config.args, cwd: directory, env: { PATH: process.env.PATH ?? "", LASTEHR_WORK_ASSISTANT_KEY: "synthetic-assistant-00000000000000000000" }, stderr: "pipe" });
    const client = new Client({ name: "arbitrary-cwd-test", version: "1" }, { capabilities: {} });
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["read_work_context", "propose_work", "get_work", "cancel_work"]);
      expect(client.getServerVersion()?.name).toBe("lastehr-synthetic-work-lab");
    } finally { await client.close(); await rm(directory, { recursive: true, force: true }); }
  }, 15_000);

  it("fails with empty stdout and static stderr when no assistant key is configured", async () => {
    const config = launch();
    try {
      await run(config.command, config.args, { env: { NODE_ENV: "test", PATH: process.env.PATH } });
      throw new Error("Expected CLI failure");
    } catch (error) {
      const failure = error as { code: number; stdout: string; stderr: string };
      expect(failure.code).toBe(1);
      expect(failure.stdout).toBe("");
      expect(failure.stderr).toContain("could not start");
      expect(failure.stderr).not.toContain(".env.local");
    }
  });
});
