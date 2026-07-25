import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildTools } from "@/lib/ai/tools";
import { WRITE_TOOL_NAMES } from "@/lib/ai/write-policy";
import type { FhirBackend } from "@/lib/fhir/backend";

// docs/fhir-coverage.md is the page every coverage claim points at, and the
// one page whose whole value is that its numbers are right. Twice now a rung
// updated the tables and left the surrounding prose stale, so the counts are
// derived from the code here instead of trusted.

const doc = readFileSync("docs/fhir-coverage.md", "utf8");

const backend = {
  search: async () => ({}),
  searchResources: async () => [],
  createResource: async (resource: unknown) => resource,
  deleteResource: async () => {},
} as unknown as FhirBackend;

function chartSections(): string[] {
  const tools = buildTools(backend);
  const schema = (tools.read_chart_section as { inputSchema?: unknown })
    .inputSchema as {
    shape?: { resourceType?: { options?: string[] } };
  };
  const options = schema?.shape?.resourceType?.options;
  if (!options?.length) {
    throw new Error("Could not introspect the chart-section allowlist.");
  }
  return options;
}

describe("docs/fhir-coverage.md stays true to the code", () => {
  it("states the real size of the chart-section allowlist", () => {
    expect(doc).toContain(`a section from a ${chartSections().length}-value allowlist`);
  });

  it("lists every readable section in the Axis A table", () => {
    // A section the agent can read but the page does not name would
    // understate coverage; the reverse would overstate it.
    for (const section of chartSections()) {
      expect(doc, `Axis A table is missing ${section}`).toMatch(
        new RegExp(`^\\\\| ${section} \\\\|`, "m"),
      );
    }
  });

  it("names every write tool it claims exist", () => {
    for (const tool of WRITE_TOOL_NAMES) {
      expect(doc, `coverage page never mentions ${tool}`).toContain(tool);
    }
  });

  it("still publishes a ceiling rather than an adjective", () => {
    // The page's reason for existing. If these go, the positioning that
    // rests on it goes too.
    expect(doc).toContain("There is no percentage of R4 on this page");
    expect(doc).toContain("## What will never be added");
  });
});
