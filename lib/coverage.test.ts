import { describe, it, expect, vi } from "vitest";

import {
  CHART_SECTION_COUNT,
  READ_TOOL_COUNT,
  PROPOSAL_TOOL_COUNT,
  TOOL_COUNT,
  US_CORE_READABLE_TYPES,
  US_CORE_TYPES_COVERED,
  US_CORE_TYPES_REMAINING,
} from "@/lib/coverage";
import { createChartReader } from "../packages/mcp/src/chart-read";

// The site publishes these numbers. This file is the reason a reader can trust
// them: the section count is pinned to the reader's own section list, so a new
// section either updates the published figure or turns CI red.
describe("published coverage numbers", () => {
  it("states the section count the reader actually accepts", () => {
    const reader = createChartReader({
      search: vi.fn(),
      searchResources: vi.fn(),
    } as never);
    const schema = reader.sectionInputSchema as unknown as {
      shape: Record<string, { options?: unknown[] }>;
    };
    const sections = schema.shape.resourceType?.options ?? [];
    expect(sections.length).toBe(CHART_SECTION_COUNT);
  });

  it("splits the tool count into reads and proposals without a remainder", () => {
    expect(READ_TOOL_COUNT + PROPOSAL_TOOL_COUNT).toBe(TOOL_COUNT);
    expect(READ_TOOL_COUNT).toBeGreaterThan(0);
    expect(PROPOSAL_TOOL_COUNT).toBeGreaterThan(0);
  });

  it("keeps the US Core count internally consistent", () => {
    // A covered count above the denominator, or a remainder that does not add
    // up, would be a claim the coverage doc does not support.
    expect(US_CORE_TYPES_COVERED).toBeLessThanOrEqual(US_CORE_READABLE_TYPES);
    expect(US_CORE_READABLE_TYPES - US_CORE_TYPES_COVERED).toBe(
      US_CORE_TYPES_REMAINING.length,
    );
  });
});
