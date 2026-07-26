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

// Public copy used to be kept count-free precisely so it could not go stale,
// and a stale count in the README is what caught us last time. The positioning
// now leads with the numbers, so instead of avoiding them they get pinned: any
// file that states an Axis A count must agree with this page, and this page is
// already checked against the code above.
describe("public copy agrees with the coverage page", () => {
  const axisA = doc.match(/\*\*(\d+) of (\d+) US Core resource types\*\*/);
  if (!axisA) {
    throw new Error("Axis A headline count not found in docs/fhir-coverage.md.");
  }
  const [, readable, total] = axisA;

  // Every surface that quotes the read-coverage number to the public.
  const copy = [
    "README.md",
    "components/Hero.tsx",
    "app/layout.tsx",
    "components/json-ld.tsx",
  ];

  it.each(copy)("%s quotes the same readable-type count", (file) => {
    const source = readFileSync(file, "utf8");
    // Tolerate line wrapping and possessive forms between the two numbers.
    const counts = [...source.matchAll(/(\d+)\s+of\s+(?:\[?US Core|US Core)/g)];
    const totals = [...source.matchAll(/(\d+)\s+readable resource types/g)];
    for (const [, stated] of counts) {
      expect(stated, `${file} states "${stated} of US Core"`).toBe(readable);
    }
    for (const [, stated] of totals) {
      expect(stated, `${file} states "${stated} readable resource types"`).toBe(
        total,
      );
    }
    // Every one of these files must actually make the claim; a silent drop
    // would pass the loops above by matching nothing.
    expect(
      counts.length + totals.length,
      `${file} no longer states the read-coverage count`,
    ).toBeGreaterThan(0);
  });

  it("keeps the section count consistent wherever it is stated", () => {
    const sections = String(chartSections().length);
    for (const file of copy) {
      const source = readFileSync(file, "utf8");
      for (const [, stated] of source.matchAll(
        /(?:across\s+)?(\d+)\s+(?:patient-scoped\s+)?sections/g,
      )) {
        expect(stated, `${file} states "${stated} sections"`).toBe(sections);
      }
    }
  });
});
