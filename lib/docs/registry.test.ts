import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveDocHref } from "@/lib/docs/links";
import {
  DOCS_REPOSITORY_URL,
  docsRegistry,
  extractHeadings,
  getDoc,
} from "@/lib/docs/registry";

describe("documentation registry", () => {
  it("maps every guide to a unique slug and matching source H1", async () => {
    expect(new Set(docsRegistry.map((doc) => doc.slug)).size).toBe(docsRegistry.length);

    await Promise.all(
      docsRegistry.map(async (doc) => {
        const markdown = await readFile(path.join(process.cwd(), doc.file), "utf8");
        expect(markdown.match(/^#\s+(.+)$/m)?.[1]).toBe(doc.title);
      }),
    );
  });

  it("creates stable, unique table-of-contents ids", () => {
    expect(
      extractHeadings("## A heading\n### Detail\n```text\n## Not a heading\n```\n## A heading"),
    ).toEqual([
      { level: 2, text: "A heading", id: "a-heading" },
      { level: 3, text: "Detail", id: "detail" },
      { level: 2, text: "A heading", id: "a-heading-1" },
    ]);
  });

  it("keeps internal docs local and repository references inspectable", () => {
    const quickstart = getDoc("quickstart");
    const adapters = getDoc("adapters");

    expect(quickstart).toBeDefined();
    expect(adapters).toBeDefined();

    expect(resolveDocHref("./adapters.md", quickstart!)).toBe("/docs/adapters");
    expect(resolveDocHref("./quickstart.md#model-providers", adapters!)).toBe(
      "/docs/quickstart#model-providers",
    );
    expect(
      resolveDocHref("../examples/fhir-adapter-starter", adapters!),
    ).toBe(`${DOCS_REPOSITORY_URL}/tree/main/examples/fhir-adapter-starter`);
    expect(
      resolveDocHref("../test/fhir-rest-adapter-contract.ts", adapters!),
    ).toBe(`${DOCS_REPOSITORY_URL}/blob/main/test/fhir-rest-adapter-contract.ts`);
  });
});
