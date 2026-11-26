/**
 * Per-server config for the stdio adapter.
 *
 * A config names the command, which tools write, and how fixtures are
 * planted. It does not score the server. Unknown fields are rejected so a
 * typo cannot silently drop a write tool.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { isRecord } from "./json.js";
import type { ServerContract } from "./contract.js";

export type ServerPrepare =
  | { kind: "pip"; package: string; bin: string }
  | { kind: "git"; repository: string; commit: string; build: string[]; bin: string };

export type ServerConfig = {
  id: string;
  title: string;
  repository: string;
  version: string;
  commit?: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  /** `repo` is this checkout. `cache` is the prepared third-party tree. */
  cwd: "repo" | "cache";
  fhirBaseUrl: string;
  writeTools: string[];
  readTools: string[];
  contract: ServerContract;
  /** Reload the synthetic charts through FHIR REST before each session. */
  reseed: boolean;
  probe?: { tool: string; arguments: Record<string, unknown> };
  /** `${config:name}` in args is replaced with a copy of this file. */
  configFiles: Record<string, string>;
  prepare?: ServerPrepare;
  reproduce: string[];
};

const DEFAULT_FHIR = "http://127.0.0.1:8080/fhir";

export function serversDirectory(): string {
  return fileURLToPath(new URL("../servers/", import.meta.url));
}

export function listServerIds(): string[] {
  return readdirSync(serversDirectory())
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

function stringRecord(value: unknown, label: string): Record<string, string> {
  if (!isRecord(value)) throw new Error(`${label} must be an object of strings`);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") throw new Error(`${label}.${key} must be a string`);
    out[key] = item;
  }
  return out;
}

function contractOf(value: unknown): ServerContract {
  if (!isRecord(value)) throw new Error("contract must be an object");
  const approval = value.approval;
  if (approval !== "mcp-elicitation" && approval !== "none") {
    throw new Error('contract.approval must be "mcp-elicitation" or "none"');
  }
  if (typeof value.scripted !== "boolean") throw new Error("contract.scripted must be a boolean");
  if (typeof value.hidesWritesWithoutElicitation !== "boolean") {
    throw new Error("contract.hidesWritesWithoutElicitation must be a boolean");
  }
  const contract: ServerContract = {
    scripted: value.scripted,
    hidesWritesWithoutElicitation: value.hidesWritesWithoutElicitation,
    citationArgs: stringArray(value.citationArgs, "contract.citationArgs"),
    approval,
  };
  if (value.patientArg !== undefined) {
    if (typeof value.patientArg !== "string" || value.patientArg.length === 0) {
      throw new Error("contract.patientArg must be a string");
    }
    contract.patientArg = value.patientArg;
  }
  if (value.savedClaim !== undefined) {
    if (typeof value.savedClaim !== "string" || value.savedClaim.length === 0) {
      throw new Error("contract.savedClaim must be a string");
    }
    contract.savedClaim = value.savedClaim;
  }
  return contract;
}

function prepareOf(value: unknown): ServerPrepare | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("prepare must be an object");
  if (value.kind === "pip") {
    if (typeof value.package !== "string" || typeof value.bin !== "string") {
      throw new Error("prepare pip needs package and bin");
    }
    return { kind: "pip", package: value.package, bin: value.bin };
  }
  if (value.kind === "git") {
    if (typeof value.repository !== "string" || typeof value.commit !== "string" || typeof value.bin !== "string") {
      throw new Error("prepare git needs repository, commit, and bin");
    }
    return {
      kind: "git",
      repository: value.repository,
      commit: value.commit,
      build: stringArray(value.build, "prepare.build"),
      bin: value.bin,
    };
  }
  throw new Error('prepare.kind must be "pip" or "git"');
}

function probeOf(value: unknown): ServerConfig["probe"] {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.tool !== "string" || !isRecord(value.arguments)) {
    throw new Error("probe needs a tool name and an arguments object");
  }
  return { tool: value.tool, arguments: value.arguments };
}

export function parseServerConfig(value: unknown, fallbackId?: string): ServerConfig {
  if (!isRecord(value)) throw new Error("Server config must be a JSON object");
  const id = typeof value.id === "string" && value.id.length > 0 ? value.id : fallbackId;
  if (!id) throw new Error("Server config needs an id");
  if (typeof value.title !== "string" || typeof value.repository !== "string" || typeof value.version !== "string") {
    throw new Error(`${id}: title, repository, and version are required`);
  }
  if (typeof value.command !== "string" || value.command.length === 0) {
    throw new Error(`${id}: command is required`);
  }
  const cwd = value.cwd === undefined ? "repo" : value.cwd;
  if (cwd !== "repo" && cwd !== "cache") throw new Error(`${id}: cwd must be "repo" or "cache"`);
  if (typeof value.reseed !== "boolean") throw new Error(`${id}: reseed must be a boolean`);
  const commit = value.commit === undefined ? undefined : value.commit;
  if (commit !== undefined && typeof commit !== "string") throw new Error(`${id}: commit must be a string`);
  const fhirBaseUrl = typeof value.fhirBaseUrl === "string" && value.fhirBaseUrl.length > 0 ? value.fhirBaseUrl : DEFAULT_FHIR;
  return {
    id,
    title: value.title,
    repository: value.repository,
    version: value.version,
    ...(commit ? { commit } : {}),
    command: value.command,
    args: stringArray(value.args, `${id} args`),
    env: stringRecord(value.env, `${id} env`),
    cwd,
    fhirBaseUrl,
    writeTools: stringArray(value.writeTools, `${id} writeTools`),
    readTools: stringArray(value.readTools, `${id} readTools`),
    contract: contractOf(value.contract),
    reseed: value.reseed,
    ...(probeOf(value.probe) ? { probe: probeOf(value.probe) } : {}),
    configFiles: stringRecord(value.configFiles ?? {}, `${id} configFiles`),
    ...(prepareOf(value.prepare) ? { prepare: prepareOf(value.prepare) } : {}),
    reproduce: stringArray(value.reproduce, `${id} reproduce`),
  };
}

export function loadServerConfig(source: { id?: string; path?: string }): ServerConfig {
  if (source.path) {
    const parsed = JSON.parse(readFileSync(source.path, "utf8")) as unknown;
    return parseServerConfig(parsed);
  }
  const id = source.id;
  if (!id) throw new Error("A server config id or path is required");
  const known = listServerIds();
  if (!known.includes(id)) {
    throw new Error(`No server config named "${id}". Known configs: ${known.join(", ") || "none"}.`);
  }
  const path = fileURLToPath(new URL(`../servers/${id}.json`, import.meta.url));
  return parseServerConfig(JSON.parse(readFileSync(path, "utf8")) as unknown, id);
}
