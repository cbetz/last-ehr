import { getDocMarkdown, getMarkdownBody } from "@/lib/docs/content";
import { docsRegistry } from "@/lib/docs/registry";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  const guides = await Promise.all(
    docsRegistry.map(async (doc) => {
      const markdown = await getDocMarkdown(doc);
      return `## ${doc.title}\n\nSource: https://www.lastehr.com/docs/${doc.slug}\n\n${getMarkdownBody(markdown)}`;
    }),
  );

  const body = [
    "# Last EHR Documentation",
    "",
    "Last EHR is an open-source reference implementation for approval-gated FHIR agents. This file mirrors the maintained repository documentation for AI-assisted discovery. Treat the documented support boundaries and safety limitations as authoritative.",
    "",
    "Project: https://github.com/cbetz/last-ehr",
    "Documentation hub: https://www.lastehr.com/docs",
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
