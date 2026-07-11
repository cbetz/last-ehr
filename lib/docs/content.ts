import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  docsRegistry,
  extractHeadings,
  stripMarkdown,
  type DocsRegistryEntry,
  type DocsSearchEntry,
} from "@/lib/docs/registry";

export async function getDocMarkdown(doc: DocsRegistryEntry): Promise<string> {
  const filePath = path.resolve(process.cwd(), doc.file);
  const projectRoot = `${process.cwd()}${path.sep}`;

  if (!filePath.startsWith(projectRoot)) {
    throw new Error(`Documentation file must stay within the project: ${doc.file}`);
  }

  const markdown = await readFile(filePath, "utf8");
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading !== doc.title) {
    throw new Error(
      `Documentation registry title mismatch for ${doc.file}: expected "${doc.title}", received "${heading ?? "no H1"}".`,
    );
  }
  return markdown;
}

export function getMarkdownBody(markdown: string): string {
  return markdown.replace(/^#\s+.+\r?\n+/, "").trim();
}

function getSearchableText(markdown: string): string {
  return stripMarkdown(
    markdown
      .replace(/```[^\n]*\n?/g, " ")
      .replace(/^#{1,6}\s+/gm, " ")
      .replace(/^\|/gm, " ")
      .replace(/\|/g, " ")
      .replace(/^>\s?/gm, " ")
      .replace(/^[-*+]\s+/gm, " ")
      .replace(/^\d+\.\s+/gm, " ")
      .replace(/\s+/g, " "),
  );
}

export async function getDocsSearchIndex(): Promise<DocsSearchEntry[]> {
  return Promise.all(
    docsRegistry.map(async (doc) => {
      const markdown = await getDocMarkdown(doc);
      return {
        slug: doc.slug,
        title: doc.title,
        description: doc.description,
        audience: doc.audience,
        keywords: doc.keywords,
        headings: extractHeadings(markdown).map((heading) => heading.text),
        content: getSearchableText(markdown),
      };
    }),
  );
}
