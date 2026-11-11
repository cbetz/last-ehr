import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import {
  FHIR_MCP_COMPARISON_CHECKED_ON,
  FHIR_MCP_COMPARISON_PATH,
  fhirMcpComparisonJsonLd,
  fhirMcpComparisonMarkdown,
  fhirMcpServers,
} from "@/lib/compare/fhir-mcp-servers";
import { productFaq } from "@/lib/faq";
import { getLlmsIndex } from "@/lib/docs/llms";

describe("FHIR MCP server comparison", () => {
  it("lists real https sources, checked on 2026-11-11, in alphabetical order", () => {
    expect(FHIR_MCP_COMPARISON_CHECKED_ON).toBe("2026-11-11");
    expect(fhirMcpServers.length).toBeGreaterThanOrEqual(10);
    const names = fhirMcpServers.map((server) => server.name);
    expect(names).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
    );
    expect(new Set(names).size).toBe(names.length);

    for (const server of fhirMcpServers) {
      expect(server.href.startsWith("https://github.com/")).toBe(true);
      expect(server.lastCommit).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(server.lastCommitHref.startsWith(server.href)).toBe(true);
      for (const source of server.sources) {
        expect(source.href.startsWith("https://")).toBe(true);
      }
      expect(server.backends.length).toBeGreaterThan(20);
      expect(server.reads.length).toBeGreaterThan(10);
      expect(server.writes.length).toBeGreaterThan(5);
      expect(server.humanApproval.length).toBeGreaterThan(5);
    }
  });

  it("states Last EHR's approval gate and experimental Epic sandbox without ranking language", () => {
    const last = fhirMcpServers.find((server) => server.name === "Last EHR");
    expect(last?.packageLabel).toBe("@lastehr/mcp 0.5.1");
    expect(last?.humanApproval.startsWith("Yes.")).toBe(true);
    expect(last?.backends).toContain("LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1");
    expect(last?.backends).toContain("public Epic sandbox");
    const markdown = fhirMcpComparisonMarkdown();
    expect(markdown).toContain(`Checked on ${FHIR_MCP_COMPARISON_CHECKED_ON}.`);
    expect(markdown).toContain("not a ranking");
    expect(markdown.toLowerCase()).not.toContain("best ");
    expect(markdown.toLowerCase()).not.toContain("unsafe");
    for (const server of fhirMcpServers) {
      expect(markdown).toContain(server.name);
      expect(markdown).toContain(server.href);
    }
  });

  it("publishes an ItemList and includes the page in the sitemap and llms index", () => {
    const jsonLd = fhirMcpComparisonJsonLd();
    const list = jsonLd.mainEntity as { numberOfItems: number; itemListElement: unknown[] };
    expect(jsonLd["@type"]).toBe("WebPage");
    expect(list.numberOfItems).toBe(fhirMcpServers.length);
    expect(list.itemListElement).toHaveLength(fhirMcpServers.length);

    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(`https://www.lastehr.com${FHIR_MCP_COMPARISON_PATH}`);

    const index = getLlmsIndex();
    expect(index).toContain(`https://www.lastehr.com${FHIR_MCP_COMPARISON_PATH}`);
    for (const item of productFaq) {
      expect(index).toContain(item.q);
      expect(index).toContain(item.a);
    }
    const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
    for (const item of productFaq) {
      expect(readme).toContain(item.q);
      expect(readme).toContain(item.a);
    }
  });
});
