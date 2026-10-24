import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocked.spawn }));

import { parseClaudeWorkEvents, runClaudeWork } from "./work-mcp-claude";

const names = ["read_work_context", "propose_work", "get_work", "cancel_work"].map((name) => `mcp__last-work__${name}`);
const firstId = "78597151-f932-4c0b-a5b3-67f06f359d63";
const secondId = "b5bcd66e-eafb-4430-ad2c-4abb5b51ad56";
const thirdId = "0363bb69-6e1f-4ffe-8700-25204387e076";
const realKill = process.kill.bind(process);
const init = { type: "system", subtype: "init", tools: names, mcp_servers: [{ name: "last-work", status: "connected" }] };
const success = { type: "result", subtype: "success", is_error: false };
const call = (id: string, name: string, input: unknown = {}) => ({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
const result = (id: string, value: unknown, isError = false) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error: isError, content: [{ type: "text", text: JSON.stringify(value) }] }] } });
const events = (...values: unknown[]) => values.map((value) => JSON.stringify(value)).join("\n") + "\n";

beforeEach(() => { vi.spyOn(process, "kill").mockReturnValue(true); });
afterEach(() => { mocked.spawn.mockReset(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("native Claude Work event evidence", () => {
  it("refuses narrated success without a connected allowlisted MCP server", () => {
    const narration = { type: "assistant", message: { content: [{ type: "text", text: `Saved Task successfully. Work ID ${firstId}.` }] } };
    expect(() => parseClaudeWorkEvents(events(narration, success))).toThrow("configured workflow");
    const disconnected = { ...init, mcp_servers: [{ name: "last-work", status: "failed" }] };
    expect(() => parseClaudeWorkEvents(events(disconnected, narration, success))).toThrow("configured workflow");
    const parsed = parseClaudeWorkEvents(events(init, narration, success));
    expect(parsed.workId).toBeUndefined();
    expect(parsed.toolsUsed).toEqual([]);
    expect(parsed).not.toHaveProperty("narration");
  });

  it("rejects unexpected built-in tools in initialization and unexpected tool calls", () => {
    expect(() => parseClaudeWorkEvents(events({ ...init, tools: [...names, "Bash"] }, success))).toThrow("configured workflow");
    expect(() => parseClaudeWorkEvents(events(init, call("shell", "Bash", { command: "cat private-file" }), success))).toThrow("unexpected tool");
    expect(() => parseClaudeWorkEvents(events(init, call("shell", "Bash", "malformed input"), success))).toThrow("unexpected tool");
  });

  it("rejects a failed native result even if another success event follows", () => {
    const failed = { type: "result", subtype: "error_during_execution", is_error: true, errors: ["sensitive-upstream-diagnostic"] };
    expect(() => parseClaudeWorkEvents(events(init, failed))).toThrow("configured workflow");
    expect(() => parseClaudeWorkEvents(events(init, failed, success))).toThrow("configured workflow");
  });

  it("accepts work IDs only from successful results correlated to allowed proposal or status calls", () => {
    const parsed = parseClaudeWorkEvents(events(
      init,
      result("unknown-call", { workId: firstId }),
      call("context", names[0]), result("context", { workId: firstId }),
      call("cancel", names[3], { workId: firstId }), result("cancel", { workId: firstId }),
      call("failed-status", names[2], { workId: firstId }), result("failed-status", { workId: firstId }, true),
      call("status", names[2], { workId: secondId }), result("status", { workId: secondId }),
      success,
    ));
    expect(parsed.workId).toBe(secondId);
    expect(parsed.toolsUsed).toEqual([names[0], names[3], names[2], names[2]]);
    expect(parsed.toolInputs.at(-1)).toEqual({ name: names[2], input: { workId: secondId } });
  });

  it("keeps the submitted proposal ID when a later status call returns another item", () => {
    const parsed = parseClaudeWorkEvents(events(
      init, call("read", names[0]), result("read", { context: { synthetic: true } }),
      call("propose", names[1], { idempotencyKey: "request-once" }), result("propose", { structuredContent: { workId: firstId } }),
      call("status", names[2], { workId: secondId }), result("status", { workId: secondId }), success,
    ));
    expect(parsed.workId).toBe(firstId);
  });

  it("does not reuse a previous status ID as evidence of an empty proposal result", () => {
    expect(() => parseClaudeWorkEvents(events(
      init, call("status-before", names[2], { workId: firstId }), result("status-before", { workId: firstId }),
      call("propose", names[1], { idempotencyKey: "request-once" }), result("propose", { message: "No proposal receipt" }),
      call("status-after", names[2], { workId: thirdId }), result("status-after", { workId: thirdId }), success,
    ))).toThrow("no correlated Work ID");
  });

  it("redacts malformed event contents and invalid identifiers", () => {
    const marker = "private-provider-token-and-chart-text";
    expect(() => parseClaudeWorkEvents(`not-json-${marker}\n`)).toThrow("invalid events");
    try { parseClaudeWorkEvents(`not-json-${marker}\n`); } catch (error) { expect(String(error)).not.toContain(marker); }
    expect(() => parseClaudeWorkEvents(events(init, call("status", names[2], { workId: firstId }), result("status", { workId: "https://attacker.invalid/receipt" }), success))).toThrow("no correlated Work ID");
  });
});

describe("native Claude Work isolation", () => {
  it("rejects missing proposal attempt keys and status keys before starting any process or network request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ANTHROPIC_API_KEY: "synthetic-test-key", LASTEHR_WORK_ASSISTANT_KEY: "assistant-test-key-000000000000000000000000" };
    await expect(runClaudeWork({ request: "Prepare an invented follow-up.", env })).rejects.toThrow("Invalid native-client configuration");
    await expect(runClaudeWork({ request: "Prepare an invented follow-up.", idempotencyKey: "bad key", env })).rejects.toThrow("Invalid native-client configuration");
    await expect(runClaudeWork({ workId: firstId, idempotencyKey: "unused-status-key", env })).rejects.toThrow("Invalid native-client configuration");
    expect(mocked.spawn).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires the native status result to match the requested item before checking server state", async () => {
    let directory = "";
    mocked.spawn.mockImplementation((_executable: string, _args: string[], options: { cwd: string }) => {
      directory = options.cwd;
      const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; kill: ReturnType<typeof vi.fn>; pid: number };
      child.stdout = new PassThrough(); child.kill = vi.fn(); child.pid = 123456789;
      queueMicrotask(() => {
        child.stdout.write(events(init, call("status", names[2], { workId: firstId }), result("status", { workId: secondId }), success));
        child.emit("close", 0);
      });
      return child;
    });
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    await expect(runClaudeWork({ workId: firstId, env: { NODE_ENV: "test", ANTHROPIC_API_KEY: "synthetic-test-key", LASTEHR_WORK_ASSISTANT_KEY: "assistant-test-key-000000000000000000000000" } })).rejects.toThrow("expected MCP calls");
    expect(fetcher).not.toHaveBeenCalled();
    expect(existsSync(directory)).toBe(false);
  });

  it("terminates the isolated process group when native output exceeds 2 MiB and removes its profile", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let directory = "";
    let detached: boolean | undefined;
    let started!: () => void;
    const spawned = new Promise<void>((accept) => { started = accept; });
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; kill: ReturnType<typeof vi.fn>; pid: number };
    child.stdout = new PassThrough(); child.kill = vi.fn(); child.pid = 123456789;
    mocked.spawn.mockImplementation((_executable: string, _args: string[], options: { cwd: string; detached: boolean }) => {
      directory = options.cwd; detached = options.detached; started(); return child;
    });
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    const operation = runClaudeWork({ workId: firstId, env: { NODE_ENV: "test", ANTHROPIC_API_KEY: "synthetic-test-key", LASTEHR_WORK_ASSISTANT_KEY: "assistant-test-key-000000000000000000000000" } });
    const rejected = expect(operation).rejects.toThrow("bounded run");
    await spawned;
    child.stdout.write(Buffer.alloc(2 * 1024 * 1024 + 1, "x"));
    expect(detached).toBe(process.platform !== "win32");
    const signals = process.platform === "win32" ? child.kill : vi.mocked(process.kill);
    if (process.platform === "win32") expect(signals).toHaveBeenCalledWith("SIGTERM");
    else expect(signals).toHaveBeenCalledWith(-child.pid, "SIGTERM");
    await vi.advanceTimersByTimeAsync(2000);
    if (process.platform === "win32") expect(signals).toHaveBeenCalledWith("SIGKILL");
    else expect(signals).toHaveBeenCalledWith(-child.pid, "SIGKILL");
    child.emit("close", 0);
    await rejected;
    expect(existsSync(directory)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("starts with a private profile, empty built-in tools and only the assistant MCP capability, then cleans up a failed client", async () => {
    const listeners = { int: process.listenerCount("SIGINT"), term: process.listenerCount("SIGTERM") };
    let capturedDirectory = "";
    let capturedArgs: string[] = [];
    let capturedEnvironment: NodeJS.ProcessEnv = { NODE_ENV: "test" };
    let capturedMcpConfig: { mcpServers: Record<string, { env: Record<string, string> }> } | undefined;
    mocked.spawn.mockImplementation((_executable: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
      capturedDirectory = options.cwd;
      capturedArgs = args;
      capturedEnvironment = options.env;
      const config = args[args.indexOf("--mcp-config") + 1];
      expect(statSync(options.cwd).mode & 0o077).toBe(0);
      expect(statSync(config).mode & 0o077).toBe(0);
      capturedMcpConfig = JSON.parse(readFileSync(config, "utf8"));
      const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; kill: ReturnType<typeof vi.fn>; pid: number };
      child.stdout = new PassThrough(); child.kill = vi.fn(); child.pid = 123456789;
      queueMicrotask(() => child.emit("close", 1));
      return child;
    });
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    const reviewerSecret = "reviewer-secret-must-never-reach-child";
    const providerSecret = "anthropic-test-key-not-used-for-a-request";
    await expect(runClaudeWork({ request: "Prepare an invented follow-up.", idempotencyKey: "test-native-attempt", executable: "test-native-client", env: {
      NODE_ENV: "test", PATH: "/usr/bin:/bin", ANTHROPIC_API_KEY: providerSecret,
      LASTEHR_WORK_ASSISTANT_KEY: "assistant-test-key-000000000000000000000000",
      LASTEHR_WORK_REVIEWER_KEY: reviewerSecret, OPENAI_API_KEY: "unrelated-provider-secret", SOME_OTHER_SECRET: "must-not-inherit",
    } })).rejects.toThrow("bounded run");
    expect(mocked.spawn).toHaveBeenCalledOnce();
    expect(capturedEnvironment.HOME).toBe(capturedDirectory);
    expect(capturedEnvironment.CLAUDE_CONFIG_DIR).toBe(join(capturedDirectory, ".claude"));
    expect(capturedEnvironment.ANTHROPIC_API_KEY).toBe(providerSecret);
    expect(capturedEnvironment.LASTEHR_WORK_REVIEWER_KEY).toBeUndefined();
    expect(capturedEnvironment.OPENAI_API_KEY).toBeUndefined();
    expect(capturedEnvironment.SOME_OTHER_SECRET).toBeUndefined();
    expect(capturedMcpConfig?.mcpServers["last-work"].env).toEqual({ ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", LASTEHR_WORK_REVIEWER_KEY: "" });
    expect(capturedArgs).toContain("--bare");
    expect(capturedArgs).toContain("--strict-mcp-config");
    expect(capturedArgs).toContain("--no-session-persistence");
    expect(capturedArgs[capturedArgs.indexOf("--tools") + 1]).toBe("");
    expect(capturedArgs[capturedArgs.indexOf("--allowedTools") + 1]).toBe(names.join(","));
    expect(capturedArgs[capturedArgs.indexOf("--max-budget-usd") + 1]).toBe("1");
    expect(capturedArgs.join(" ")).not.toContain(reviewerSecret);
    expect(capturedArgs.join(" ")).not.toContain(providerSecret);
    expect(existsSync(capturedDirectory)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(process.listenerCount("SIGINT")).toBe(listeners.int);
    expect(process.listenerCount("SIGTERM")).toBe(listeners.term);
  });

  it.skipIf(process.platform === "win32").each(["SIGINT", "SIGTERM"] as const)("cleans up a detached fake native client and private profile when the wrapper receives %s", async (signal) => {
    const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
    const directory = mkdtempSync(join(tmpdir(), "lastehr-native-signal-test-"));
    const marker = join(directory, "native-started.json");
    const terminated = join(directory, "native-received-term");
    const executable = join(directory, "fake-native-client.mjs");
    writeFileSync(executable, `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, JSON.stringify({ pid: process.pid, cwd: process.cwd() }));\nprocess.on('SIGTERM', () => { writeFileSync(${JSON.stringify(terminated)}, 'received'); });\nsetInterval(() => {}, 1000);\n`, { mode: 0o700 });
    const moduleUrl = new URL("./work-mcp-claude.ts", import.meta.url).href;
    const provider = "synthetic-provider-key-no-network-test";
    const source = `import mod from ${JSON.stringify(moduleUrl)};\ntry { await mod.runClaudeWork({ workId: ${JSON.stringify(firstId)}, executable: ${JSON.stringify(executable)} }); process.exitCode = 90; } catch { console.log('WRAPPER_STOPPED_SAFELY'); process.exitCode = 42; }`;
    const wrapper = actual.spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", source], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { NODE_ENV: "test", PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, ANTHROPIC_API_KEY: provider, LASTEHR_WORK_ASSISTANT_KEY: "assistant-test-key-000000000000000000000000" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let native: { pid: number; cwd: string } | undefined;
    let output = "";
    wrapper.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    wrapper.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((accept, reject) => {
      wrapper.once("error", reject);
      wrapper.once("close", (code, closedSignal) => accept({ code, signal: closedSignal }));
    });
    try {
      await expect.poll(() => {
        if (wrapper.exitCode !== null) throw new Error(`The fake-client wrapper exited before startup: ${output}`);
        return existsSync(marker);
      }, { timeout: 10_000 }).toBe(true);
      native = JSON.parse(readFileSync(marker, "utf8"));
      expect(existsSync(native!.cwd)).toBe(true);
      expect(wrapper.kill(signal)).toBe(true);
      const result = await closed;
      expect(result).toEqual({ code: 42, signal: null });
      expect(existsSync(terminated)).toBe(true);
      expect(existsSync(native!.cwd)).toBe(false);
      expect(() => realKill(native!.pid, 0)).toThrow();
      expect(output).toContain("WRAPPER_STOPPED_SAFELY");
      expect(output).not.toContain(provider);
    } finally {
      if (wrapper.exitCode === null && wrapper.signalCode === null) wrapper.kill("SIGKILL");
      if (native) {
        try { realKill(process.platform === "win32" ? native.pid : -native.pid, "SIGKILL"); } catch { /* Test group is already gone. */ }
        rmSync(native.cwd, { recursive: true, force: true });
      }
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15_000);
});
