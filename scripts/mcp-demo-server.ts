import { readFileSync } from "node:fs";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  createReadTools,
  type McpReadTool,
  type MedplumReadClient,
} from "../packages/mcp/src/read-tools.js";
import { createMcpServer } from "../packages/mcp/src/server.js";
import { SyntheticHapiReadClient } from "./synthetic-hapi-read-client";

export const LOCAL_HAPI_MCP_URL = "http://127.0.0.1:8080/fhir";

function localLabVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version?: string };
  return manifest.version ?? "0.0.0";
}

export const MCP_DEMO_SERVER_VERSION = localLabVersion();

function isLoopbackHapiUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      url.port === "8080" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      url.pathname.replace(/\/+$/, "") === "/fhir"
    );
  } catch {
    return false;
  }
}

export function assertLocalHapiMcpUrl(value: string): string {
  if (!isLoopbackHapiUrl(value)) {
    throw new Error(
      "The synthetic HAPI Local Lab only connects to its loopback Docker endpoint.",
    );
  }
  return value;
}

/**
 * The Local Lab keeps the two whole-chart reads and deliberately drops
 * read_chart_section and read_document, which @lastehr/mcp does offer.
 *
 * Not a safety gate — the fixture client already refuses any resource type
 * outside its six-type allowlist, so the section reader could not escape it.
 * It is an honesty one: the section reader advertises 23 sections, 17 of which
 * this Lab would refuse, and the Lab's whole purpose is a surface small enough
 * to inspect. Its own instructions promise exactly two tools, and offering a
 * tool that mostly errors would make that promise false while looking
 * generous.
 */
const LOCAL_LAB_TOOLS = new Set(["search_patients", "show_patient_info"]);

function createSyntheticLabTools(client: MedplumReadClient): McpReadTool[] {
  return createReadTools(client)
    .filter((tool) => LOCAL_LAB_TOOLS.has(tool.name))
    .map((tool) => ({
      ...tool,
      description:
        tool.name === "search_patients"
          ? "Search the four seeded synthetic patients by name. This checkout-only Local Lab is read-only and never searches outside the fixture set."
          : "Show a seeded synthetic patient's chart by resource id. This checkout-only Local Lab is read-only and rejects unseeded patient ids.",
    }));
}

export type McpDemoServerOptions = {
  /** Injectable only for Docker-free protocol tests. */
  client?: MedplumReadClient;
  /** Kept loopback-only even when called outside the CLI. */
  baseUrl?: string;
};

export async function createMcpDemoServer({
  client,
  baseUrl = LOCAL_HAPI_MCP_URL,
}: McpDemoServerOptions = {}) {
  const safeBaseUrl = assertLocalHapiMcpUrl(baseUrl);
  const readClient = client ?? (await SyntheticHapiReadClient.connect(safeBaseUrl));
  const tools = createSyntheticLabTools(readClient);
  const server = createMcpServer(tools, {
    name: "lastehr-synthetic-demo",
    version: MCP_DEMO_SERVER_VERSION,
    instructions:
      "Checkout-only synthetic HAPI Local Lab. It exposes exactly two read-only tools over the four seeded fixture charts, never accepts credentials, and is not a PHI or production path.",
  });

  return { server, tools };
}

export async function startMcpDemoServer() {
  const { server, tools } = await createMcpDemoServer();

  await server.connect(new StdioServerTransport());
  // stdout is exclusively MCP JSON-RPC. A client starts this process after
  // `npm run mcp:demo` has already prepared the synthetic HAPI stack.
  console.error(
    `Last EHR synthetic MCP Local Lab ready: ${tools.length} read-only fixture tools.`,
  );

  return { server, tools };
}
