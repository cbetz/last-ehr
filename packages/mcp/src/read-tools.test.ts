import { describe, expect, it, vi } from "vitest";

import {
  createReadTools,
  type MedplumReadClient,
} from "./read-tools.js";
import { callMcpTool, listMcpTools } from "./server.js";

function createClient(): MedplumReadClient {
  return {
    search: vi.fn().mockResolvedValue({ entry: [] }),
    searchResources: vi.fn().mockImplementation(async (resourceType) => {
      if (resourceType === "Patient") {
        return [{ resourceType: "Patient", id: "patient-1", name: [] }];
      }
      return [];
    }),
  } as unknown as MedplumReadClient;
}

describe("read-only MCP tools", () => {
  it("exposes exactly the two read tools with read-only annotations", () => {
    const definitions = listMcpTools(createReadTools(createClient()));

    expect(definitions.map((tool) => tool.name)).toEqual([
      "search_patients",
      "show_patient_info",
    ]);
    expect(definitions.every((tool) => tool.annotations.readOnlyHint)).toBe(true);
  });

  it.each(["add_note", "record_observation"])(
    "does not recognize the historical write tool %s",
    async (name) => {
      const result = await callMcpTool(
        createReadTools(createClient()),
        name,
        {},
      );

      expect(result).toEqual({
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      });
    },
  );

  it("searches through Medplum with structured parameters", async () => {
    const client = createClient();
    const result = await callMcpTool(
      createReadTools(client),
      "search_patients",
      { name: "Smith & Jones" },
    );

    expect(client.search).toHaveBeenCalledWith("Patient", {
      name: "Smith & Jones",
      _count: "20",
    });
    expect(result.isError).toBeUndefined();
  });
});
