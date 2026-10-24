#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { WorkConnectorClient } from "../lib/work/connector-client";
import { createWorkMcpServer, WORK_MCP_VERSION } from "../lib/work/mcp";

const DEFAULT_URL = "http://127.0.0.1:3300";

type Arguments = { mode: "serve" | "help" | "config" | "version"; baseUrl: string };

/** Keep generated launch configuration independent of the MCP host's cwd. */
export function workMcpLaunchConfig(baseUrl = DEFAULT_URL): Record<string, unknown> {
  return {
    mcpServers: {
      "last-work": {
        command: process.execPath,
        args: ["--import", createRequire(import.meta.url).resolve("tsx"), fileURLToPath(new URL("./work-mcp.ts", import.meta.url)), "--url", validateUrl(baseUrl)],
      },
    },
  };
}

function validateUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid configuration."); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" ||
    url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}\/?$/.test(value) ||
    Number(url.port) < 1024 || Number(url.port) > 65535) throw new Error("Invalid configuration.");
  return url.origin;
}

export function parseWorkMcpArguments(args: string[]): Arguments {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) return { mode: "help", baseUrl: DEFAULT_URL };
  if (args.length === 1 && args[0] === "--version") return { mode: "version", baseUrl: DEFAULT_URL };
  let baseUrl = DEFAULT_URL;
  let mode: Arguments["mode"] = "serve";
  let urlSeen = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--print-config" && mode === "serve") { mode = "config"; continue; }
    if (arg === "--url" && !urlSeen && args[index + 1]) {
      baseUrl = validateUrl(args[++index]);
      urlSeen = true;
      continue;
    }
    throw new Error("Invalid arguments.");
  }
  return { mode, baseUrl };
}

function help(): string {
  return [
    "Last synthetic Work Lab MCP connector (checkout only)",
    "",
    "Usage: npm run work:mcp -- [--url http://127.0.0.1:3300]",
    "       npm run work:mcp -- --print-config [--url http://127.0.0.1:3300]",
    "       npm run work:mcp -- --help | --version",
    "",
    "Start the Work Lab separately. Set LASTEHR_WORK_ASSISTANT_KEY in the MCP",
    "host's environment. No .env files are read. Never supply a reviewer key.",
    "The printed config contains absolute paths and inherits the host environment;",
    "it does not include or expand credentials. Synthetic data only.",
    "",
    "Launch the printed command/args directly from an MCP host: npm's normal",
    "status banner must not be mixed into the stdio MCP protocol stream.",
  ].join("\n");
}

export async function runWorkMcpCli(args = process.argv.slice(2), env = process.env): Promise<void> {
  const options = parseWorkMcpArguments(args);
  if (options.mode === "help") { process.stdout.write(`${help()}\n`); return; }
  if (options.mode === "version") { process.stdout.write(`${WORK_MCP_VERSION}\n`); return; }
  if (options.mode === "config") { process.stdout.write(`${JSON.stringify(workMcpLaunchConfig(options.baseUrl), null, 2)}\n`); return; }
  const assistantKey = env.LASTEHR_WORK_ASSISTANT_KEY;
  if (!assistantKey) throw new Error("Invalid configuration.");
  const client = new WorkConnectorClient({ baseUrl: options.baseUrl, assistantKey });
  const server = createWorkMcpServer({ client });
  let closing = false;
  const cleanup = () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  };
  const shutdown = () => {
    if (closing) return;
    closing = true;
    cleanup();
    void server.close().catch(() => { process.exitCode = 1; });
  };
  server.onerror = () => { process.stderr.write("Last Work MCP encountered a protocol error. Diagnostic details were withheld.\n"); };
  server.onclose = cleanup;
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try { await server.connect(new StdioServerTransport()); } catch (error) { cleanup(); throw error; }
}

function isEntryPoint(): boolean {
  try { return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; }
  catch { return false; }
}

if (isEntryPoint()) void runWorkMcpCli().catch(() => {
  process.stderr.write("Last Work MCP could not start. Check --help, the numeric loopback lab URL, and LASTEHR_WORK_ASSISTANT_KEY. Configuration values were withheld.\n");
  process.exitCode = 1;
});
