import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DOCKER_NOT_RUNNING_MESSAGE,
  assertDockerDaemonRunning,
  inspectDockerDaemon,
  type DockerDaemonStatus,
} from "./docker-preflight";

const repositoryRoot = join(import.meta.dirname, "..");
const tsxCli = join(repositoryRoot, "node_modules/tsx/dist/cli.mjs");

type FakeBehavior = "running" | "not-running" | "missing" | "other-error";

function fakeSpawn(behavior: FakeBehavior) {
  return () => {
    const child = new EventEmitter();
    process.nextTick(() => {
      if (behavior === "running") {
        child.emit("exit", 0, null);
        return;
      }
      if (behavior === "not-running") {
        child.emit("exit", 1, null);
        return;
      }
      if (behavior === "missing") {
        child.emit(
          "error",
          Object.assign(new Error("spawn docker ENOENT"), { code: "ENOENT" }),
        );
        return;
      }
      child.emit("error", Object.assign(new Error("permission denied"), { code: "EACCES" }));
    });
    return child;
  };
}

function writeFakeDocker(logPath: string): string {
  const dir = mkdtempSync(join(tmpdir(), "lastehr-docker-"));
  const bin = join(dir, "docker");
  writeFileSync(
    bin,
    [
      "#!/bin/sh",
      `printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}`,
      'if [ "$1" = "info" ]; then',
      '  echo "UNIQUE_DOCKER_STDERR_DO_NOT_LEAK" >&2',
      "  exit 1",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(bin, 0o755);
  return dir;
}

function runScript(
  script: string,
  args: string[],
  pathValue = process.env.PATH,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, script, ...args], {
      cwd: repositoryRoot,
      env: { ...process.env, PATH: pathValue },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

describe("docker daemon preflight", () => {
  it("treats a zero exit as a running daemon", async () => {
    await expect(inspectDockerDaemon(fakeSpawn("running"))).resolves.toBe(
      "running" satisfies DockerDaemonStatus,
    );
    await expect(assertDockerDaemonRunning(fakeSpawn("running"))).resolves.toBeUndefined();
  });

  it("throws one friendly line when docker info fails", async () => {
    await expect(inspectDockerDaemon(fakeSpawn("not-running"))).resolves.toBe("not-running");
    await expect(assertDockerDaemonRunning(fakeSpawn("not-running"))).rejects.toThrow(
      DOCKER_NOT_RUNNING_MESSAGE,
    );
    expect(DOCKER_NOT_RUNNING_MESSAGE.split("\n")).toHaveLength(1);
  });

  it("leaves a missing docker binary on the existing spawn path", async () => {
    await expect(inspectDockerDaemon(fakeSpawn("missing"))).resolves.toBe("missing");
    await expect(assertDockerDaemonRunning(fakeSpawn("missing"))).resolves.toBeUndefined();
  });

  it("does not relabel other spawn failures as a stopped daemon", async () => {
    await expect(assertDockerDaemonRunning(fakeSpawn("other-error"))).rejects.toThrow(
      "permission denied",
    );
  });
});

describe("demo:local and mcp:demo when the daemon is down", () => {
  it("demo:local exits with the friendly line and does not run compose", async () => {
    const logPath = join(mkdtempSync(join(tmpdir(), "lastehr-docker-log-")), "args");
    const binDir = writeFakeDocker(logPath);
    const result = await runScript(
      "scripts/demo-local.ts",
      ["--prepare"],
      `${binDir}${delimiter}${process.env.PATH ?? ""}`,
    );

    expect(result.code).toBe(1);
    expect(result.stderr.trim()).toBe(DOCKER_NOT_RUNNING_MESSAGE);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("UNIQUE_DOCKER_STDERR_DO_NOT_LEAK");
    expect(result.stderr).not.toContain("compose");
    expect(readFileSync(logPath, "utf8").trim()).toBe("info");
  });

  it("mcp:demo exits with the friendly line before preparing the stack", async () => {
    const logPath = join(mkdtempSync(join(tmpdir(), "lastehr-docker-log-")), "args");
    const binDir = writeFakeDocker(logPath);
    const result = await runScript(
      "scripts/mcp-demo.ts",
      ["--prepare"],
      `${binDir}${delimiter}${process.env.PATH ?? ""}`,
    );

    expect(result.code).toBe(1);
    expect(result.stderr.trim()).toBe(DOCKER_NOT_RUNNING_MESSAGE);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("UNIQUE_DOCKER_STDERR_DO_NOT_LEAK");
    expect(result.stderr).not.toContain("demo:local");
    expect(readFileSync(logPath, "utf8").trim()).toBe("info");
  });

  it("demo:local still reports a missing docker binary from spawn", async () => {
    const empty = mkdtempSync(join(tmpdir(), "lastehr-no-docker-"));
    const result = await runScript("scripts/demo-local.ts", ["--prepare"], empty);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Could not start docker:");
    expect(result.stderr).toContain("ENOENT");
    expect(result.stderr).not.toContain(DOCKER_NOT_RUNNING_MESSAGE);
  });
});
