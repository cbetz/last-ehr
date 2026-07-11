import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const runHapiE2E = process.env.RUN_HAPI_E2E === "1";
const repositoryRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);
const tsxLoader = resolve(repositoryRoot, "node_modules/tsx/dist/loader.mjs");
const serverScript = resolve(repositoryRoot, "scripts/mcp-demo.ts");

function textResult(result: { content: Array<{ type: string; text?: string }> }) {
  const block = result.content.find(
    (content): content is { type: "text"; text: string } => content.type === "text",
  );
  if (!block) {
    throw new Error("Expected a text MCP tool result.");
  }
  return JSON.parse(block.text) as Record<string, unknown>;
}

if (!runHapiE2E) {
  describe.skip("synthetic HAPI MCP Local Lab integration", () => {});
} else {
  describe("synthetic HAPI MCP Local Lab integration", () => {
    it(
      "starts over stdio without credentials and reads only seeded charts",
      async () => {
        const transport = new StdioClientTransport({
          command: process.execPath,
          args: ["--import", tsxLoader, serverScript, "--serve"],
          cwd: repositoryRoot,
          env: process.env.PATH ? { PATH: process.env.PATH } : {},
          stderr: "pipe",
        });
        let diagnostics = "";
        transport.stderr?.on("data", (chunk: Buffer) => {
          diagnostics += chunk.toString();
        });
        const client = new Client({
          name: "lastehr-local-lab-test",
          version: "1.0.0",
        });

        try {
          await client.connect(transport);

          expect(client.getServerVersion()).toEqual(
            expect.objectContaining({ name: "lastehr-synthetic-demo" }),
          );
          const listed = await client.listTools();
          expect(listed.tools.map((tool) => tool.name)).toEqual([
            "search_patients",
            "show_patient_info",
          ]);
          expect(
            listed.tools.every((tool) => tool.annotations?.readOnlyHint),
          ).toBe(true);

          const search = textResult(
            await client.callTool({
              name: "search_patients",
              arguments: { name: "Smith" },
            }),
          );
          const entries = (search.patients ?? []) as Array<{
            resource?: { id?: string; identifier?: Array<{ value?: string }> };
          }>;
          expect(entries.length).toBeGreaterThanOrEqual(2);
          const john = entries.find((entry) =>
            entry.resource?.identifier?.some(
              (identifier) => identifier.value === "synthetic-001",
            ),
          )?.resource;
          expect(john?.id).toBeTruthy();

          const chart = textResult(
            await client.callTool({
              name: "show_patient_info",
              arguments: { id: john?.id },
            }),
          );
          expect(chart.patient).toEqual(
            expect.objectContaining({ id: john?.id }),
          );
          expect(chart.conditions).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ text: "Essential hypertension" }),
            ]),
          );
          expect(chart.medications).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ text: "Lisinopril 10 mg tablet" }),
            ]),
          );
        } catch (error) {
          throw new Error(
            `${error instanceof Error ? error.message : "MCP Local Lab failed."}\n${diagnostics}`,
          );
        } finally {
          await client.close();
          await transport.close();
        }
      },
      60_000,
    );
  });
}
