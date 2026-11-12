import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { beforeAll, describe, expect, it } from "vitest";

import { READ_TOOL_NAMES } from "./read-tools.js";
import { MCP_SERVER_VERSION } from "./server.js";
import { WRITE_TOOL_NAMES } from "./write-tools.js";

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

function doctor(args: string[], settings: Record<string, string>) {
  const cwd = mkdtempSync(join(tmpdir(), "lastehr-doctor-"));
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(?:MEDPLUM_|LASTEHR_|HAPI_|FHIR_)/.test(key)) delete env[key];
  }
  try {
    return spawnSync(process.execPath, [dist, "doctor", ...args], {
      cwd,
      env: { ...env, ...settings },
      encoding: "utf8",
      timeout: 15_000,
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

const PLACEHOLDER = "<replace-with-a-least-privilege-token>";

function toolText(result: { content?: unknown }): string {
  if (!Array.isArray(result.content)) return "";
  return result.content
    .map((item) =>
      item && typeof item === "object" && "text" in item && typeof item.text === "string"
        ? item.text
        : "",
    )
    .join("\n");
}

/**
 * Spawn the built CLI the way a directory sandbox does: a clean cwd, so a
 * checkout .env cannot supply a real token, and an explicit env.
 */
async function withSpawnedServer(
  env: Record<string, string>,
  elicitation: boolean,
  run: (
    client: Client,
    stderr: () => string,
    prompts: string[],
  ) => Promise<void>,
) {
  const cwd = mkdtempSync(join(tmpdir(), "lastehr-catalog-"));
  const stderrChunks: string[] = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [dist],
    cwd,
    env,
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk: Buffer | string) => {
    stderrChunks.push(String(chunk));
  });
  const client = new Client(
    { name: "catalog-spawn", version: "0" },
    { capabilities: elicitation ? { elicitation: {} } : {} },
  );
  const prompts: string[] = [];
  if (elicitation) {
    client.setRequestHandler(ElicitRequestSchema, async () => {
      prompts.push("approval");
      return { action: "decline" };
    });
  }
  try {
    await client.connect(transport);
    await run(client, () => stderrChunks.join(""), prompts);
  } finally {
    await client.close().catch(() => {});
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe("the built CLI actually runs", () => {
  // These exercise the compiled artifact. CI runs `npm test` before
  // `npm run build`, and a dist left from an older source would hide a
  // startup exit, so this always rebuilds.
  beforeAll(() => {
    execFileSync("npm", ["run", "build", "--workspace=@lastehr/mcp"], {
      cwd: resolve(import.meta.dirname, "../../.."),
      encoding: "utf8",
      stdio: "pipe",
    });
  }, 120_000);

  it("prints the version when executed directly", () => {
    expect(run(dist)).toBe(MCP_SERVER_VERSION);
  });

  it("is executable, so a shell can run it through the bin link", () => {
    // The npm `bin` is a symlink to this file and it carries a #!/usr/bin/env
    // node shebang, so a shell needs the exec bit. tsc writes 0644, and npm
    // only chmods bin targets at INSTALL time — which means the published
    // package self-heals while the workspace link does not. Inside the
    // checkout, `npx -y @lastehr/mcp` therefore failed with "Permission
    // denied" for anyone following the README.
    //
    // Deliberately executed as a program rather than `node <path>`: passing the
    // path to node bypasses both the mode and the shebang, which is exactly why
    // the tests below missed this.
    expect(statSync(dist).mode & 0o111, "dist/cli.js is not executable").not.toBe(0);
    expect(readFileSync(dist, "utf8").split("\n", 1)[0]).toBe("#!/usr/bin/env node");
    expect(
      execFileSync(dist, ["--version"], { encoding: "utf8" }).trim(),
    ).toBe(MCP_SERVER_VERSION);
  });

  it("prints the version when executed through a bin symlink, as npx does", () => {
    const link = join(mkdtempSync(join(tmpdir(), "lastehr-bin-")), "lastehr-mcp");
    symlinkSync(dist, link);
    // Before the realpath fix this returned "" with exit code 0: no server, no
    // error, no output.
    expect(run(link)).toBe(MCP_SERVER_VERSION);
  });

  it("runs the default doctor without connecting and keeps stdout empty", () => {
    const result = doctor([], { MEDPLUM_ACCESS_TOKEN: "private-doctor-token" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("No connection attempted");
    expect(result.stderr).not.toContain("github.com/cbetz/last-ehr");
    expect(result.stderr).not.toContain("private-doctor-token");
  });

  it("exits nonzero for a failed live connection without raw backend details", () => {
    const result = doctor(["--connect"], {
      FHIR_BACKEND: "hapi",
      HAPI_BASE_URL: "http://127.0.0.1:1/private-doctor-path",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Connection check failed");
    expect(result.stderr).not.toContain("github.com/cbetz/last-ehr");
    expect(result.stderr).not.toMatch(/private-doctor-path|127\.0\.0\.1|TypeError|fetch failed/);
  });

  it("doctor still rejects a missing credential and still accepts a placeholder until --connect", () => {
    const missing = doctor([], {});
    expect(missing.status).toBe(1);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toContain("configuration is invalid");

    const placeholder = doctor([], { MEDPLUM_ACCESS_TOKEN: PLACEHOLDER });
    expect(placeholder.status).toBe(0);
    expect(placeholder.stdout).toBe("");
    expect(placeholder.stderr).toContain("access token");
    expect(placeholder.stderr).not.toContain(PLACEHOLDER);
  });

  it.each([
    { label: "no env", env: {} as Record<string, string>, needle: "MEDPLUM_ACCESS_TOKEN is missing" },
    {
      label: "placeholder token",
      env: { MEDPLUM_ACCESS_TOKEN: PLACEHOLDER },
      needle: "MEDPLUM_ACCESS_TOKEN is invalid",
    },
  ])("stdio tools/list returns every read tool for $label", async ({ env, needle }) => {
    await withSpawnedServer(env, false, async (client, stderr) => {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([...READ_TOOL_NAMES]);
      for (const tool of tools) {
        expect(tool.description.length).toBeGreaterThan(0);
        expect(tool.inputSchema).toMatchObject({ type: "object" });
        expect(tool.inputSchema).toHaveProperty("properties");
        expect(tool.annotations).toMatchObject({ readOnlyHint: true });
      }

      const result = await client.callTool({
        name: "search_patients",
        arguments: { name: "Ada Lovelace" },
      });
      expect(result.isError).toBe(true);
      const text = toolText(result);
      expect(text).toContain(needle);
      expect(text).toContain("npx @lastehr/mcp init");
      expect(text).toContain("npx @lastehr/mcp doctor");
      expect(text).not.toContain(PLACEHOLDER);
      expect(stderr()).toContain("read-only tools");
      expect(stderr()).not.toContain(PLACEHOLDER);
    });
  }, 20_000);

  it("lists write tools over stdio and does not ask for approval without a credential", async () => {
    await withSpawnedServer({ LASTEHR_MCP_WRITES: "proposal" }, true, async (client, _stderr, prompts) => {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        ...READ_TOOL_NAMES,
        ...WRITE_TOOL_NAMES,
      ]);
      for (const tool of tools) {
        const write = (WRITE_TOOL_NAMES as readonly string[]).includes(tool.name);
        expect(tool.annotations).toMatchObject(
          write
            ? { readOnlyHint: false, destructiveHint: false }
            : { readOnlyHint: true },
        );
      }
      const result = await client.callTool({
        name: "add_note",
        arguments: { patientId: "patient-synthetic", text: "Synthetic note." },
      });
      expect(result.isError).toBe(true);
      expect(toolText(result)).toContain("MEDPLUM_ACCESS_TOKEN is missing");
      expect(prompts).toEqual([]);
    });
  }, 20_000);
});

describe("in-process synthetic backend over stdio", () => {
  function demoEnv(stdout: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const match of stdout.matchAll(/--env ([A-Z0-9_]+)=(\S+)/g)) {
      const key = match[1];
      const value = match[2];
      if (key && value) env[key] = value;
    }
    return env;
  }

  it("init --demo --client claude-code prints a command whose env starts the built server", () => {
    const cwd = mkdtempSync(join(tmpdir(), "lastehr-demo-init-"));
    try {
      const result = spawnSync(
        process.execPath,
        [dist, "init", "--demo", "--client", "claude-code"],
        { cwd, encoding: "utf8", timeout: 15_000 },
      );
      expect(result.status).toBe(0);
      const line = result.stdout.split("\n").find((entry) => entry.startsWith("claude mcp add"));
      expect(line).toContain("--env FHIR_BACKEND=memory");
      expect(line).toContain("--env LASTEHR_MCP_WRITES=proposal");
      expect(line).toContain(`npx -y @lastehr/mcp@${MCP_SERVER_VERSION}`);
      expect(demoEnv(result.stdout)).toEqual({
        FHIR_BACKEND: "memory",
        LASTEHR_MCP_WRITES: "proposal",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("reads a seeded patient and runs approve and decline with only the env init prints", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "lastehr-memory-"));
    const init = spawnSync(
      process.execPath,
      [dist, "init", "--demo", "--client", "claude-code"],
      { cwd, encoding: "utf8", timeout: 15_000 },
    );
    expect(init.status).toBe(0);
    const env = demoEnv(init.stdout);
    expect(env).toEqual({
      FHIR_BACKEND: "memory",
      LASTEHR_MCP_WRITES: "proposal",
    });
    const prompts: string[] = [];
    let decisions = 0;
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [dist],
      cwd,
      env,
      stderr: "pipe",
    });
    const stderrChunks: string[] = [];
    transport.stderr?.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(String(chunk));
    });
    const client = new Client(
      { name: "memory-stdio", version: "0" },
      { capabilities: { elicitation: {} } },
    );
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      prompts.push(request.params.message);
      decisions += 1;
      if (decisions === 1) return { action: "accept", content: { approve: true } };
      return { action: "decline" };
    });
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        ...READ_TOOL_NAMES,
        ...WRITE_TOOL_NAMES,
      ]);

      const search = await client.callTool({
        name: "search_patients",
        arguments: { name: "Maria Garcia" },
      });
      expect(search.isError).toBeFalsy();
      const patients = JSON.parse(toolText(search)).patients as Array<{ id: string; name: string }>;
      expect(patients).toHaveLength(1);
      expect(patients[0]?.name).toContain("Garcia");
      const patientId = patients[0]?.id ?? "";

      const chart = await client.callTool({
        name: "show_patient_info",
        arguments: { id: patientId },
      });
      expect(chart.isError).toBeFalsy();
      expect(toolText(chart).toLowerCase()).toContain("asthma");

      const approved = await client.callTool({
        name: "add_note",
        arguments: { patientId, text: "Approved synthetic note." },
      });
      expect(approved.isError).toBeFalsy();
      const approvedBody = JSON.parse(toolText(approved)) as {
        saved: boolean;
        id?: string;
        notice?: string;
      };
      expect(approvedBody.saved).toBe(true);
      expect(approvedBody.id).toBeTruthy();
      expect(approvedBody.notice).toContain("this process only");
      expect(approvedBody.notice).toContain("Not a chart on a FHIR server");

      const declined = await client.callTool({
        name: "add_note",
        arguments: { patientId, text: "Declined synthetic note." },
      });
      expect(declined.isError).toBeFalsy();
      const declinedBody = JSON.parse(toolText(declined)) as { saved: boolean; outcome: string };
      expect(declinedBody.saved).toBe(false);
      expect(declinedBody.outcome).toContain("did not approve");

      const after = await client.callTool({
        name: "show_patient_info",
        arguments: { id: patientId },
      });
      const afterText = toolText(after);
      expect(afterText).toContain("Approved synthetic note.");
      expect(afterText).not.toContain("Declined synthetic note.");
      expect(prompts).toHaveLength(2);
      expect(stderrChunks.join("")).toContain("until this process exits");
    } finally {
      await client.close().catch(() => {});
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 20_000);
});
