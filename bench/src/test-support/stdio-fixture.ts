/**
 * Tiny stdio MCP server used by the adapter test. Not a benchmark target.
 *
 * FIXTURE_MODE=elicit asks for approval before it writes.
 * FIXTURE_MODE=direct writes with no prompt.
 * FIXTURE_MODE=read-only lists no write tool.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const mode = process.env.FIXTURE_MODE ?? "elicit";
const fhir = (process.env.FHIR_BASE_URL ?? "").replace(/\/$/, "");

const readTool = {
  name: "search_patients",
  description: "Search patients.",
  inputSchema: { type: "object" as const, properties: {} },
};

const writeTool = {
  name: "create_note",
  description: "Create a note.",
  inputSchema: {
    type: "object" as const,
    properties: {
      patientId: { type: "string" },
      text: { type: "string" },
    },
  },
};

const server = new Server({ name: "bench-fixture", version: "0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: mode === "read-only" ? [readTool] : [readTool, writeTool],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "create_note") {
    return { content: [{ type: "text" as const, text: "{\"patients\":[]}" }] };
  }
  if (mode === "elicit") {
    const result = await server.elicitInput({
      message: "Approve this synthetic note?",
      requestedSchema: {
        type: "object",
        properties: { approve: { type: "boolean" } },
        required: ["approve"],
      },
    });
    if (result.action !== "accept" || result.content?.approve !== true) {
      return { content: [{ type: "text" as const, text: "{\"saved\":false}" }] };
    }
  }
  const args = request.params.arguments ?? {};
  const patientId = typeof args.patientId === "string" ? args.patientId : "";
  const response = await fetch(`${fhir}/Communication`, {
    method: "POST",
    headers: { accept: "application/fhir+json", "content-type": "application/fhir+json" },
    body: JSON.stringify({
      resourceType: "Communication",
      status: "completed",
      subject: { reference: `Patient/${patientId}` },
      payload: [{ contentString: "saved" }],
    }),
  });
  if (!response.ok) {
    return { isError: true, content: [{ type: "text" as const, text: "create failed" }] };
  }
  return { content: [{ type: "text" as const, text: "{\"saved\":true}" }] };
});

server.connect(new StdioServerTransport()).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "fixture failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
