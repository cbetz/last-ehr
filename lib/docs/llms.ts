import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { resolveDocHref } from "@/lib/docs/links";

import {
  DOCS_REPOSITORY_URL,
  docsGroups,
  docsRegistry,
  getDocHref,
  getDocsByGroup,
  type DocsRegistryEntry,
} from "@/lib/docs/registry";

const SITE_URL = "https://www.lastehr.com";

export function getLlmsIndex(): string {
  return [
    "# Last EHR",
    "",
    "> Open-source AI tools for FHIR patient charts: a web app and MCP server for chart reads and human-approved writes.",
    "",
    "Last EHR is alpha software. Start with synthetic data. Medplum is the supported authenticated backend; other adapters have synthetic evaluation paths. In external model modes, messages and chart context go to the configured provider. The backend remains the system of record.",
    "",
    "## Project and overview",
    "",
    `- [Last EHR](${SITE_URL}/): What the tools do, a synthetic example, and current backend support.`,
    `- [Documentation](${SITE_URL}/docs): Setup, architecture, support boundaries, and implementation guides.`,
    `- [Headless EHR](${SITE_URL}/headless-ehr): How a FHIR backend and the application fit together.`,
    `- [Chart reads](${SITE_URL}/chat-with-fhir-data): How chart tools work, incomplete results, and the model-provider data flow.`,
    `- [Write approvals](${SITE_URL}/approval-gated-writes): Proposal, review, cancellation, backend permissions, and MCP approval.`,
    `- [Medplum setup](${SITE_URL}/medplum-ai-agent): Connect a Medplum project, use SMART launch, or install MCP tools.`,
    `- [Roadmap](${SITE_URL}/roadmap): Shipped capabilities and remaining work.`,
    `- [Source repository](${DOCS_REPOSITORY_URL}): Apache-2.0 source, tests, releases, and contributions.`,
    "",
    ...docsGroups.flatMap((group) => [
      `## ${group}`,
      "",
      ...getDocsByGroup(group).map(
        (doc) => `- [${doc.title}](${SITE_URL}${getDocHref(doc)}): ${doc.description}`,
      ),
      "",
    ]),
    "## Optional",
    "",
    `- [Full documentation text](${SITE_URL}/llms-full.txt): The complete published guide collection, with absolute source and resource links.`,
    `- [Synthetic demo](${SITE_URL}/demo): Interactive chart tools; the demo uses synthetic patients.`,
    `- [Privacy](${SITE_URL}/privacy): Hosted-site analytics, cookies, signup form, and demo processing.`,
    "",
  ].join("\n");
}

type MarkdownNode = {
  type: string;
  url?: string;
  identifier?: string;
  children?: MarkdownNode[];
  position?: {
    start: { offset?: number };
    end: { offset?: number };
  };
};

function getAbsoluteResourceUrl(
  href: string,
  doc: DocsRegistryEntry,
  image: boolean,
): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return href;
  }

  if (href.startsWith("#") || !href) {
    return new URL(resolveDocHref(href, doc), `${SITE_URL}${getDocHref(doc)}`).href;
  }

  if (href.startsWith("/")) {
    return new URL(href, SITE_URL).href;
  }

  // Resolve relative paths in the originating repository document, even
  // though this export combines many guides at a different site URL.
  const resource = new URL(href, `https://repository.invalid/${doc.file}`);
  const sourcePath = decodeURIComponent(resource.pathname.slice(1));
  const targetDoc = docsRegistry.find((entry) => entry.file === sourcePath);
  const suffix = `${resource.search}${resource.hash}`;

  if (targetDoc && !image) {
    return `${SITE_URL}${getDocHref(targetDoc)}${resource.search}${resolveDocHref(resource.hash, targetDoc)}`;
  }

  if (image) {
    const repositoryPath = new URL(DOCS_REPOSITORY_URL).pathname;
    return `https://raw.githubusercontent.com${repositoryPath}/main${resource.pathname}${suffix}`;
  }

  const isFile = sourcePath.split("/").at(-1)?.includes(".") ?? false;
  return `${DOCS_REPOSITORY_URL}/${isFile ? "blob" : "tree"}/main${resource.pathname}${suffix}`;
}

function getDestinationSpan(source: string, definition: boolean) {
  // Walk the label instead of searching for ](: nested image/link labels
  // and escaped brackets can contain that same sequence.
  let depth = 0;
  let start = -1;
  for (let index = source.startsWith("!") ? 1 : 0; index < source.length; index++) {
    if (source[index] === "\\") {
      index++;
    } else if (source[index] === "[") {
      depth++;
    } else if (source[index] === "]" && --depth === 0) {
      if (source[index + 1] !== (definition ? ":" : "(")) return undefined;
      start = index + 2;
      break;
    }
  }
  if (start < 0) return undefined;
  while (/\s/.test(source[start] ?? "")) start++;

  if (source[start] === "<") {
    for (let end = start + 1; end < source.length; end++) {
      if (source[end] === "\\") {
        end++;
      } else if (source[end] === ">") {
        return { start: start + 1, end };
      }
    }
    return undefined;
  }

  depth = 0;
  let end = start;
  for (; end < source.length; end++) {
    const character = source[end];
    if (character === "\\") {
      end++;
    } else if (character === "(") {
      depth++;
    } else if (character === ")") {
      if (depth === 0 && !definition) break;
      depth--;
    } else if (/\s/.test(character) && depth === 0) {
      break;
    }
  }
  return { start, end };
}

/** Rewrite Markdown destinations without reformatting prose or code examples. */
export function rewriteExportLinks(markdown: string, doc: DocsRegistryEntry): string {
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MarkdownNode;
  const nodes: MarkdownNode[] = [];
  const visit = (node: MarkdownNode) => {
    nodes.push(node);
    node.children?.forEach(visit);
  };
  visit(root);

  const imageReferences = new Set(
    nodes.filter((node) => node.type === "imageReference").map((node) => node.identifier),
  );
  const replacements = nodes.flatMap((node) => {
    if (!["link", "image", "definition"].includes(node.type) || node.url === undefined) {
      return [];
    }
    const offset = node.position?.start.offset;
    const endOffset = node.position?.end.offset;
    if (offset === undefined || endOffset === undefined) return [];

    const image = node.type === "image" ||
      (node.type === "definition" && imageReferences.has(node.identifier));
    const destination = getAbsoluteResourceUrl(node.url, doc, image);
    if (destination === node.url) return [];
    const span = getDestinationSpan(markdown.slice(offset, endOffset), node.type === "definition");
    if (!span) return [];
    return [{ start: offset + span.start, end: offset + span.end, destination }];
  });

  // Apply from the end so offsets from the Markdown parser remain valid.
  return replacements.sort((a, b) => b.start - a.start).reduce(
    (result, replacement) =>
      result.slice(0, replacement.start) + replacement.destination + result.slice(replacement.end),
    markdown,
  );
}
