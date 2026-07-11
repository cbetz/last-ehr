import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isMcpDemoClient,
  renderMcpDemoInit,
  type McpDemoClient,
} from "./mcp-demo-config";
import { startMcpDemoServer } from "./mcp-demo-server";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function help(): string {
  return [
    "Last EHR MCP Local Lab — synthetic HAPI, no FHIR credentials or model-provider API key",
    "",
    "Usage:",
    "  npm run mcp:demo [-- --client json|claude-code|cursor]",
    "  npm run mcp:demo -- --prepare",
    "",
    "The default command starts local HAPI, resets the synthetic fixtures, and prints a client configuration.",
    "The generated MCP process is silent on stdout and exposes only two read-only fixture tools.",
  ].join("\n");
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });

    child.once("error", (error) => {
      reject(new Error(`Could not start ${command}: ${error.message}`));
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} exited with ${
            signal ? `signal ${signal}` : `code ${code ?? 1}`
          }.`,
        ),
      );
    });
  });
}

function parseClient(args: string[]): McpDemoClient {
  if (args.length === 0) return "json";
  if (args.length === 2 && args[0] === "--client" && isMcpDemoClient(args[1])) {
    return args[1];
  }
  throw new Error("Expected --client json, claude-code, or cursor.");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 1 && ["--help", "-h", "help"].includes(args[0])) {
    process.stdout.write(`${help()}\n`);
    return;
  }

  if (args.length === 1 && args[0] === "--serve") {
    // Do not prepare, seed, or log to stdout here. This mode is launched by
    // an MCP client, where stdout is exclusively the JSON-RPC transport.
    await startMcpDemoServer();
    return;
  }

  const prepareOnly = args.length === 1 && args[0] === "--prepare";
  const client = prepareOnly ? undefined : parseClient(args);

  await run(npm, ["run", "demo:local:prepare"]);

  if (prepareOnly) {
    process.stdout.write("Synthetic HAPI MCP Local Lab is prepared.\n");
    return;
  }

  process.stdout.write(
    renderMcpDemoInit(client, { repositoryRoot, nodePath: process.execPath }),
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "MCP Local Lab setup failed.",
  );
  process.exitCode = 1;
});
