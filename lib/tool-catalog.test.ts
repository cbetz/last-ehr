import { describe, it, expect, vi } from "vitest";

import { buildTools } from "@/lib/ai/tools";
import { TOOL_CATALOG, READ_TOOLS, PROPOSAL_TOOLS } from "@/lib/tool-catalog";
import type { FhirBackend } from "@/lib/fhir/backend";
import { READ_TOOL_NAMES } from "../packages/mcp/src/read-tools";
import { WRITE_TOOL_NAMES } from "../packages/mcp/src/write-tools";

// The catalog is the published description of the agent's surface (homepage
// manifest, docs). These tests are the reason it can be trusted: a new tool
// that nobody describes, or a described tool that no longer ships, fails here
// instead of silently shipping a manifest that understates the agent.
const backend = {
  search: vi.fn(),
  searchResources: vi.fn(),
  createResource: vi.fn(),
  deleteResource: vi.fn(),
} as FhirBackend;

describe("tool catalog", () => {
  it("describes exactly the tools the web agent registers", () => {
    const registered = Object.keys(buildTools(backend)).sort();
    const described = TOOL_CATALOG.map((t) => t.name).sort();
    expect(described).toEqual(registered);
  });

  it("describes exactly the tools the MCP package registers", () => {
    const mcp = [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES].sort();
    const described = TOOL_CATALOG.map((t) => t.name).sort();
    expect(described).toEqual(mcp);
  });

  it("classifies every MCP write tool as a proposal, never a read", () => {
    // A write mislabeled "read" in the manifest would advertise the exact
    // safety property this project exists to make legible.
    const proposals = PROPOSAL_TOOLS.map((t) => t.name).sort();
    expect(proposals).toEqual([...WRITE_TOOL_NAMES].sort());
    const reads = READ_TOOLS.map((t) => t.name).sort();
    expect(reads).toEqual([...READ_TOOL_NAMES].sort());
  });

  it("gives every tool a non-empty detail line", () => {
    for (const tool of TOOL_CATALOG) {
      expect(tool.detail.trim().length, tool.name).toBeGreaterThan(0);
    }
  });
});
