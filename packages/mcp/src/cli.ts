#!/usr/bin/env node

import { config as loadEnv } from "dotenv";

import { McpConfigurationError, loadMcpConfig } from "./config.js";
import { isMcpClient, renderInit, type McpClient } from "./init.js";
import { startMcpServer } from "./server.js";

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
    "",
    "Auth: set MEDPLUM_ACCESS_TOKEN, or MEDPLUM_CLIENT_ID plus MEDPLUM_CLIENT_SECRET.",
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
        : config.accessToken
          ? "access token"
          : "client credentials";
    console.error(
      `Last EHR MCP configuration is valid (${config.backend}; ${authSummary}; ${config.writePolicy === "proposal" ? "proposal-gated writes" : "read-only"}).`,
    );
    return;
  }

  if (command === "serve") {
    await startMcpServer({ env });
    return;
  }

  throw new McpConfigurationError(`Unknown command: ${command}`);
}

runCli().catch((error: unknown) => {
  const message =
    error instanceof McpConfigurationError
      ? error.message
      : "Last EHR MCP could not start. Verify the backend configuration and try again.";
  console.error(message);
  process.exitCode = 1;
});
