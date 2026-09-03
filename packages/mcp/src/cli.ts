#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { McpConfigurationError, loadMcpConfig } from "./config.js";
import { isMcpClient, renderInit, type McpClient } from "./init.js";
import { MCP_SERVER_VERSION, startMcpServer } from "./server.js";

function hasExplicitMedplumAuth(env: NodeJS.ProcessEnv) {
  return Boolean(
    env.MEDPLUM_ACCESS_TOKEN ||
      env.MEDPLUM_CLIENT_ID ||
      env.MEDPLUM_CLIENT_SECRET,
  );
}

function loadEnvironmentFiles(env: NodeJS.ProcessEnv) {
  // MCP stdio hosts must receive no non-protocol stdout. dotenv's quiet mode
  // also keeps an installed package silent when a project has local env files.
  // An MCP host's explicit credential must win as a complete auth choice: do
  // not supplement an access token with client credentials from a checkout's
  // .env file, which would make the safe configuration look ambiguous.
  if (hasExplicitMedplumAuth(env)) {
    return;
  }

  loadEnv({ path: ".env.local", quiet: true });
  loadEnv({ path: ".env", quiet: true });
}

function help() {
  return [
    "Last EHR MCP — read-only FHIR chart tools (Medplum, or the local HAPI stack)",
    "",
    "Usage:",
    "  npx -y @lastehr/mcp                 Start the stdio MCP server",
    "  npx -y @lastehr/mcp init [--client json|claude-code|cursor]",
    "  npx -y @lastehr/mcp doctor          Validate local configuration",
    "  npx -y @lastehr/mcp --version       Print the package version",
    "",
    "Auth: set MEDPLUM_ACCESS_TOKEN, or MEDPLUM_CLIENT_ID plus MEDPLUM_CLIENT_SECRET.",
    "Remote: LASTEHR_MCP_TRANSPORT=http with LASTEHR_MCP_RESOURCE, _OAUTH_ISSUER,",
    "_OAUTH_JWKS_URI, _EXCHANGE_CLIENT_ID, _TOKEN_ENDPOINT (see docs/remote-mcp.md).",
    "Local stack: FHIR_BACKEND=hapi with HAPI_BASE_URL or FHIR_BASE_URL",
    "(no credentials; the local no-auth evaluation stack, synthetic data only).",
  ].join("\n");
}

function initClient(args: string[]): McpClient {
  if (args.length === 0) {
    return "json";
  }

  if (args.length === 2 && args[0] === "--client" && isMcpClient(args[1])) {
    return args[1];
  }

  throw new McpConfigurationError(
    "init accepts --client json, claude-code, or cursor.",
  );
}

export async function runCli(
  args: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
) {
  const command = args[0] ?? "serve";

  if (command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(`${help()}\n`);
    return;
  }

  if (command === "--version" || command === "-v") {
    process.stdout.write(`${MCP_SERVER_VERSION}\n`);
    return;
  }

  if (command === "init") {
    process.stdout.write(renderInit(initClient(args.slice(1))));
    return;
  }

  loadEnvironmentFiles(env);

  if (command === "doctor") {
    const config = loadMcpConfig(env);
    const authSummary =
      config.backend === "hapi"
        ? "local no-auth HAPI"
        : config.transport === "http"
          ? `per-caller OAuth (token exchange); resource ${config.http?.resource}`
          : config.accessToken
            ? "access token"
            : "client credentials";
    console.error(
      `Last EHR MCP configuration is valid (${config.backend}; ${authSummary}; ${config.writePolicy === "proposal" ? "proposal-gated writes" : "read-only"}).`,
    );
    return;
  }

  if (command === "serve") {
    const config = loadMcpConfig(env);
    if (config.transport === "http") {
      // Loaded only here, so a stdio process never pulls in node:http or the
      // SDK's Node transport. loadMcpConfig is pure, so the second load inside
      // startMcpServer on the stdio branch is harmless and that call is
      // byte-identical to what it was.
      const { startRemoteMcpServer } = await import("./remote-server.js");
      await startRemoteMcpServer({ config });
      return;
    }
    await startMcpServer({ env });
    return;
  }

  throw new McpConfigurationError(`Unknown command: ${command}`);
}

/**
 * True only when this file is the process entry point, so importing it for a
 * test does not start a server.
 *
 * argv[1] must be resolved through realpath first. npm installs the `bin` as a
 * SYMLINK (node_modules/.bin/lastehr-mcp -> dist/cli.js), so under the
 * documented `npx -y @lastehr/mcp` invocation argv[1] is the symlink while
 * import.meta.url is the resolved target. Comparing them unresolved makes this
 * false in exactly the case that matters, and the CLI then exits 0 having done
 * nothing — no server, no error, no output.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    // argv[1] may not exist on disk (some runners pass a virtual path); fall
    // back to the unresolved comparison rather than refusing to start.
    return import.meta.url === pathToFileURL(entry).href;
  }
}

const isDirectExecution = isEntryPoint();

if (isDirectExecution) {
  runCli().catch((error: unknown) => {
    const message =
      error instanceof McpConfigurationError
        ? error.message
        : "Last EHR MCP could not start. Verify the backend configuration and try again.";
    console.error(message);
    process.exitCode = 1;
  });
}
