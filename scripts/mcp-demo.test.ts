import type { Bundle, ExtractResource, ResourceType } from "@medplum/fhirtypes";
import { describe, expect, it, vi } from "vitest";

import { SYNTHETIC_SYSTEM } from "@/lib/fhir/synthetic";
import { patients } from "@/scripts/fixtures/patients";

import type { MedplumReadClient } from "../packages/mcp/src/read-tools.js";
import { callMcpTool, listMcpTools } from "../packages/mcp/src/server.js";
import {
  createMcpDemoCommand,
  renderMcpDemoInit,
} from "./mcp-demo-config";
import {
  assertLocalHapiMcpUrl,
  createMcpDemoServer,
} from "./mcp-demo-server";
import { SyntheticHapiReadClient } from "./synthetic-hapi-read-client";

function createFixtureBackend() {
  const fixturePatients = new Map(
    patients.map((fixture, index) => [
      fixture.key,
      {
        resourceType: "Patient" as const,
        id: `fixture-${index + 1}`,
        identifier: [{ system: SYNTHETIC_SYSTEM, value: fixture.key }],
        name: [{ family: fixture.family, given: fixture.given }],
      },
    ]),
  );

  const searchResources = vi.fn(
    async (resourceType: ResourceType, params?: Record<string, string>) => {
      if (resourceType === "Patient" && params?.identifier) {
        const key = params.identifier.split("|")[1];
        const patient = fixturePatients.get(key);
        return patient ? [patient] : [];
      }
      return [];
    },
  );

  const client = {
    search: vi.fn().mockResolvedValue({ entry: [] }),
    searchResources,
  } as unknown as MedplumReadClient;

  return { client, searchResources };
}

describe("MCP Local Lab configuration", () => {
  it("renders a direct, zero-credential launcher for a checkout", () => {
    const command = createMcpDemoCommand({
      repositoryRoot: "/work/last-ehr",
      nodePath: "/opt/node/bin/node",
    });
    const config = JSON.parse(
      renderMcpDemoInit("cursor", {
        repositoryRoot: "/work/last-ehr",
        nodePath: "/opt/node/bin/node",
      }),
    ) as {
      mcpServers: Record<string, { command: string; args: string[]; env?: unknown }>;
    };

    expect(command).toEqual({
      command: "/opt/node/bin/node",
      args: [
        "--import",
        "/work/last-ehr/node_modules/tsx/dist/loader.mjs",
        "/work/last-ehr/scripts/mcp-demo.ts",
        "--serve",
      ],
    });
    expect(config.mcpServers["lastehr-synthetic"]).toEqual(command);
    expect(config.mcpServers["lastehr-synthetic"].env).toBeUndefined();
    expect(JSON.stringify(config)).not.toContain("MEDPLUM_");
    expect(JSON.stringify(config)).not.toContain("npm");
  });

  it("renders a copy-ready Claude Code command without package credentials", () => {
    const command = renderMcpDemoInit("claude-code", {
      repositoryRoot: "/work/last ehr",
      nodePath: "/opt/node/bin/node",
    });

    expect(command).toContain(
      '"claude" "mcp" "add" "lastehr-synthetic" "--scope" "local"',
    );
    expect(command).toContain('"/work/last ehr/scripts/mcp-demo.ts"');
    expect(command).not.toContain("MEDPLUM_");
    expect(command).not.toContain("add_note");
  });
});

describe("MCP Local Lab safety boundary", () => {
  it("keeps the server surface read-only and rejects historical write names", async () => {
    const { client } = createFixtureBackend();
    const { tools } = await createMcpDemoServer({ client });

    const definitions = listMcpTools(tools);
    expect(definitions.map((tool) => tool.name)).toEqual([
      "search_patients",
      "show_patient_info",
    ]);
    expect(definitions.every((tool) => tool.annotations.readOnlyHint)).toBe(true);

    await expect(callMcpTool(tools, "add_note", {})).resolves.toEqual({
      isError: true,
      content: [{ type: "text", text: "Unknown tool: add_note" }],
    });
  });

  it("allows only loopback HAPI and fixture patient ids", async () => {
    expect(() => assertLocalHapiMcpUrl("https://fhir.example.com/fhir")).toThrow(
      "loopback Docker endpoint",
    );
    expect(assertLocalHapiMcpUrl("http://127.0.0.1:8080/fhir")).toBe(
      "http://127.0.0.1:8080/fhir",
    );

    const { client, searchResources } = createFixtureBackend();
    const safeClient = await SyntheticHapiReadClient.fromBackend(client);
    const smiths = await safeClient.search("Patient", { name: "Smith" });
    const foreign = await safeClient.searchResources("Patient", {
      _id: "not-a-fixture",
    });
    const beforeForeignChart = searchResources.mock.calls.length;
    const foreignChart = await safeClient.searchResources("Condition", {
      patient: "not-a-fixture",
    });

    expect(smiths.entry).toHaveLength(2);
    expect(foreign).toEqual([]);
    expect(foreignChart).toEqual([]);
    expect(searchResources.mock.calls).toHaveLength(beforeForeignChart);
  });
});
