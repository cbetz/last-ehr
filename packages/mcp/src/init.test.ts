import { afterEach, describe, expect, it, vi } from "vitest";

// A different release (including a prerelease) proves setup follows the
// executable's version source rather than a hardcoded current release.
vi.mock("./server.js", () => ({ MCP_SERVER_VERSION: "9.8.7-test.1" }));

import { initNextSteps, writeInitNextSteps } from "./cli-hints.js";
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

  it("prints a demo config with the memory backend and proposal writes", () => {
    const json = JSON.parse(renderInit("json", "memory"));
    expect(json.mcpServers.lastehr.env).toEqual({
      FHIR_BACKEND: "memory",
      LASTEHR_MCP_WRITES: "proposal",
    });
    expect(json.mcpServers.lastehr.args).toEqual(["-y", "@lastehr/mcp@9.8.7-test.1"]);
    expect(json.mcpServers.lastehr).not.toHaveProperty("type");

    const cursor = JSON.parse(renderInit("cursor", "memory")).mcpServers.lastehr;
    expect(cursor.type).toBe("stdio");
    expect(cursor.env.FHIR_BACKEND).toBe("memory");
    expect(cursor.env.LASTEHR_MCP_WRITES).toBe("proposal");

    const command = renderInit("claude-code", "memory");
    const commandLine = command.split("\n").find((line) => line.startsWith("claude mcp add"));
    expect(commandLine).toBe(
      "claude mcp add lastehr --env FHIR_BACKEND=memory --env LASTEHR_MCP_WRITES=proposal -- npx -y @lastehr/mcp@9.8.7-test.1",
    );
    expect(command).toContain("Not a chart on a FHIR server");
    expect(command).not.toContain("MEDPLUM_ACCESS_TOKEN");
  });

  it("keeps setup text free of the terminal pointer", () => {
    for (const client of ["json", "claude-code", "cursor"] as const) {
      expect(renderInit(client)).not.toContain("github.com/cbetz/last-ehr");
      expect(renderInit(client)).not.toContain("www.lastehr.com/docs");
      expect(renderInit(client, "epic")).not.toContain("github.com/cbetz/last-ehr");
      expect(renderInit(client, "memory")).not.toContain("github.com/cbetz/last-ehr");
    }
  });
});

describe("init terminal pointer", () => {
  const terminal = { isTTY: true };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is at most six plain lines and stays off stdout", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const text = initNextSteps();
    const lines = text.split("\n").filter((line) => line.length > 0);

    expect(lines).toEqual([
      "Next steps:",
      'Read: "Search for synthetic patient Maria Garcia and show her chart." init --demo seeds her.',
      'Write: "Propose a note that says this chart was reviewed."',
      "The client asks you to approve it before anything is saved. init --demo sets `LASTEHR_MCP_WRITES=proposal`.",
      "Issues, benchmark, and roadmap: https://github.com/cbetz/last-ehr (a star helps other people find it).",
      "Issues: https://github.com/cbetz/last-ehr/issues",
    ]);
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toMatch(/^[\n\x20-\x7e]*$/);
    expect(text).not.toMatch(/clinical|compliance|HIPAA|certified/i);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("writes the pointer only for a TTY, and not when LASTEHR_QUIET=1 or CI=true", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const tty = vi.fn();
    writeInitNextSteps({} as NodeJS.ProcessEnv, { isTTY: true, write: tty }, terminal);
    expect(tty).toHaveBeenCalledOnce();
    expect(tty).toHaveBeenCalledWith(initNextSteps());

    const quiet = vi.fn();
    writeInitNextSteps(
      { LASTEHR_QUIET: "1" } as unknown as NodeJS.ProcessEnv,
      { isTTY: true, write: quiet },
      terminal,
    );
    expect(quiet).not.toHaveBeenCalled();

    const ci = vi.fn();
    writeInitNextSteps(
      { CI: "true" } as unknown as NodeJS.ProcessEnv,
      { isTTY: true, write: ci },
      terminal,
    );
    expect(ci).not.toHaveBeenCalled();

    const ciNumeric = vi.fn();
    writeInitNextSteps(
      { CI: "1" } as unknown as NodeJS.ProcessEnv,
      { isTTY: true, write: ciNumeric },
      terminal,
    );
    expect(ciNumeric).not.toHaveBeenCalled();

    const ciOff = vi.fn();
    writeInitNextSteps(
      { CI: "false" } as unknown as NodeJS.ProcessEnv,
      { isTTY: true, write: ciOff },
      terminal,
    );
    expect(ciOff).toHaveBeenCalledWith(initNextSteps());

    const piped = vi.fn();
    writeInitNextSteps({} as NodeJS.ProcessEnv, { isTTY: false, write: piped }, terminal);
    expect(piped).not.toHaveBeenCalled();

    const stdoutPiped = vi.fn();
    writeInitNextSteps(
      {} as NodeJS.ProcessEnv,
      { isTTY: true, write: stdoutPiped },
      { isTTY: false },
    );
    expect(stdoutPiped).not.toHaveBeenCalled();

    const unset = vi.fn();
    writeInitNextSteps({} as NodeJS.ProcessEnv, { write: unset }, terminal);
    expect(unset).not.toHaveBeenCalled();

    expect(stdout).not.toHaveBeenCalled();
  });
});
