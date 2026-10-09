import { describe, expect, it } from "vitest";

import { getLlmsIndex, rewriteExportLinks } from "@/lib/docs/llms";
import { docsRegistry, getDoc } from "@/lib/docs/registry";

const mcp = getDoc("mcp")!;

describe("documentation text exports", () => {
  it("indexes every published guide using an absolute canonical URL", () => {
    const index = getLlmsIndex();
    for (const doc of docsRegistry) {
      expect(index).toContain(`https://www.lastehr.com/docs/${doc.slug}`);
      expect(index).toContain(doc.description);
    }
    expect(index).toContain("https://www.lastehr.com/llms-full.txt");
  });

  it("keeps fragments and query parameters attached to their originating guides", () => {
    const markdown = [
      "[support](./support.md#backends)",
      "[section](#remote-transport-http-opt-in)",
      "[query](./support.md?view=plain#backends)",
      "[site](/docs/quickstart#medplum-backed-demo)",
      "[empty]()",
      "[coverage](./fhir-coverage.md#axis-c--resolution-mechanisms)",
    ].join("\n\n");

    expect(rewriteExportLinks(markdown, mcp)).toBe([
      "[support](https://www.lastehr.com/docs/support#backends)",
      "[section](https://www.lastehr.com/docs/mcp#remote-transport-http-opt-in)",
      "[query](https://www.lastehr.com/docs/support?view=plain#backends)",
      "[site](https://www.lastehr.com/docs/quickstart#medplum-backed-demo)",
      "[empty](https://www.lastehr.com/docs/mcp)",
      "[coverage](https://www.lastehr.com/docs/fhir-coverage#axis-c-resolution-mechanisms)",
    ].join("\n\n"));
  });

  it("routes repository files and directories to GitHub and images to raw assets", () => {
    const markdown = [
      "[code](../packages/mcp/src/server.ts#L4)",
      "[directory](../examples/fhir-adapter-starter)",
      '![chart](../artifacts/chart.png "Synthetic chart")',
    ].join("\n\n");

    expect(rewriteExportLinks(markdown, mcp)).toBe([
      "[code](https://github.com/cbetz/last-ehr/blob/main/packages/mcp/src/server.ts#L4)",
      "[directory](https://github.com/cbetz/last-ehr/tree/main/examples/fhir-adapter-starter)",
      '![chart](https://raw.githubusercontent.com/cbetz/last-ehr/main/artifacts/chart.png "Synthetic chart")',
    ].join("\n\n"));
  });

  it("rewrites reference destinations and nested linked images while preserving titles", () => {
    const markdown = [
      "[support][guide] and ![chart][image]",
      '[guide]: <./support.md#backends> "Guide title"',
      '[image]: ../artifacts/chart.png "Image title"',
      "[![preview](../artifacts/chart.png)](./support.md)",
    ].join("\n\n");

    expect(rewriteExportLinks(markdown, mcp)).toBe([
      "[support][guide] and ![chart][image]",
      '[guide]: <https://www.lastehr.com/docs/support#backends> "Guide title"',
      '[image]: https://raw.githubusercontent.com/cbetz/last-ehr/main/artifacts/chart.png "Image title"',
      "[![preview](https://raw.githubusercontent.com/cbetz/last-ehr/main/artifacts/chart.png)](https://www.lastehr.com/docs/support)",
    ].join("\n\n"));
  });

  it("handles escaped labels and nested destination parentheses", () => {
    const markdown = String.raw`[escaped\]:label](../examples/example\(fixture\).ts "Title")`;
    expect(rewriteExportLinks(markdown, mcp)).toBe(
      String.raw`[escaped\]:label](https://github.com/cbetz/last-ehr/blob/main/examples/example(fixture).ts "Title")`,
    );
  });

  it("preserves external URLs, prose, fenced code, and inline code verbatim", () => {
    const markdown = [
      "Intro text with **formatting**.",
      "[external](https://example.com/a) and [mail](mailto:hello@example.com)",
      "`[inline example](./support.md)`",
      "```md\n[code example](./support.md)\n```",
      "~~~md\n![code image](../chart.png)\n~~~",
    ].join("\n\n");
    expect(rewriteExportLinks(markdown, mcp)).toBe(markdown);
  });
});
