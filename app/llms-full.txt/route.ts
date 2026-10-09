import { getDocMarkdown, getMarkdownBody } from "@/lib/docs/content";
import { rewriteExportLinks } from "@/lib/docs/llms";
import { docsRegistry } from "@/lib/docs/registry";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  const guides = await Promise.all(
    docsRegistry.map(async (doc) => {
      const markdown = await getDocMarkdown(doc);
      const body = rewriteExportLinks(getMarkdownBody(markdown), doc);
      return `## ${doc.title}\n\nSource: https://www.lastehr.com/docs/${doc.slug}\n\n${body}`;
    }),
  );

  const body = [
    "# Last EHR Documentation",
    "",
    "Last EHR is an open-source alpha web app and MCP server for FHIR chart reads and human-approved writes. This file contains the complete published guide collection. The support matrix and threat model describe the current operating boundaries and limitations.",
    "",
    "Project: https://github.com/cbetz/last-ehr",
    "Documentation hub: https://www.lastehr.com/docs",
    "Documentation index: https://www.lastehr.com/llms.txt",
    "",
    ...guides,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
