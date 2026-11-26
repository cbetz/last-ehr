/**
 * Install a pinned third-party server into bench/.cache and build the
 * stdio command. The cache is local and gitignored. The published reproduce
 * lines stay in the server config.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

import type { ServerConfig } from "./server-config.js";

const exec = promisify(execFile);

export type Launch = {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  fhirBaseUrl: string;
};

async function run(command: string, args: string[], cwd?: string): Promise<string> {
  try {
    const result = await exec(command, args, { cwd, encoding: "utf8", timeout: 180_000 });
    return result.stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : "prepare failed";
    throw new Error(message.split("\n")[0]?.slice(0, 200) || "prepare failed");
  }
}

async function prepareBin(config: ServerConfig, cacheRoot: string): Promise<{ command: string; cwd?: string }> {
  const prepare = config.prepare;
  if (!prepare) return { command: config.command === "node" ? process.execPath : config.command };
  const root = join(cacheRoot, config.id);
  if (prepare.kind === "pip") {
    const venv = join(root, "venv");
    const bin = join(venv, "bin", prepare.bin);
    if (!existsSync(bin)) {
      await run("python3", ["-m", "venv", venv]);
      await run(join(venv, "bin", "pip"), ["install", prepare.package]);
    }
    if (!existsSync(bin)) throw new Error(`pip install did not provide ${prepare.bin}`);
    return { command: bin, cwd: root };
  }
  const src = join(root, "src");
  if (!existsSync(join(src, ".git"))) {
    await run("git", ["clone", prepare.repository, src]);
  }
  const head = (await run("git", ["rev-parse", "HEAD"], src)).trim();
  if (head !== prepare.commit) {
    await run("git", ["fetch", "--depth", "1", "origin", prepare.commit], src);
    await run("git", ["checkout", "--detach", prepare.commit], src);
  }
  const bin = join(src, prepare.bin);
  if (!existsSync(bin)) {
    const [build, ...args] = prepare.build;
    if (!build) throw new Error(`${config.id}: prepare.build is empty`);
    await run(build, args, src);
  }
  if (!existsSync(bin)) throw new Error(`${config.id}: build did not produce ${prepare.bin}`);
  return { command: bin, cwd: src };
}

export async function resolveLaunch(
  config: ServerConfig,
  options: { repoRoot: string; fhirBaseUrl?: string; cacheRoot: string },
): Promise<Launch> {
  const fhirBaseUrl = (options.fhirBaseUrl || config.fhirBaseUrl).replace(/\/$/, "");
  const prepared = await prepareBin(config, options.cacheRoot);
  const files: Record<string, string> = {};
  for (const [name, relative] of Object.entries(config.configFiles)) {
    const source = await readFile(resolve(options.repoRoot, relative), "utf8");
    const dir = await mkdtemp(join(tmpdir(), "bench-mcp-"));
    const dest = join(dir, basename(relative));
    await writeFile(dest, source.replaceAll("${FHIR_BASE_URL}", fhirBaseUrl));
    files[name] = dest;
  }
  const args = config.args.map((arg) => {
    const configName = arg.match(/^\$\{config:([A-Za-z0-9_-]+)\}$/)?.[1];
    if (configName) {
      const path = files[configName];
      if (!path) throw new Error(`${config.id}: missing config file "${configName}"`);
      return path;
    }
    return arg.replaceAll("${FHIR_BASE_URL}", fhirBaseUrl);
  });
  const env: Record<string, string> = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  for (const [key, value] of Object.entries(config.env)) {
    env[key] = value.replaceAll("${FHIR_BASE_URL}", fhirBaseUrl);
  }
  const cwd = config.cwd === "cache" && prepared.cwd ? prepared.cwd : options.repoRoot;
  return { command: prepared.command, args, env, cwd, fhirBaseUrl };
}
