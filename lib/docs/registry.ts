export const DOCS_REPOSITORY_URL = "https://github.com/cbetz/last-ehr";

export type DocsGroup =
  | "Evaluate"
  | "Understand"
  | "Build & integrate"
  | "Operate & maintain";

export type DocsRegistryEntry = {
  slug: string;
  file: string;
  title: string;
  description: string;
  group: DocsGroup;
  order: number;
  audience: string;
  lastModified: string;
  keywords: readonly string[];
};

export type DocsSearchEntry = Pick<
  DocsRegistryEntry,
  "slug" | "title" | "description" | "audience" | "keywords"
> & {
  headings: readonly string[];
  content: string;
};

export const docsRegistry: readonly DocsRegistryEntry[] = [
  {
    slug: "quickstart",
    file: "docs/quickstart.md",
    title: "Quickstart",
    description:
      "Run the zero-key local demo or connect the authenticated Medplum path.",
    group: "Evaluate",
    order: 10,
    audience: "Evaluators and first-time builders",
    lastModified: "2026-07-14",
    keywords: ["local", "HAPI", "Medplum", "setup", "Docker"],
  },
  {
    slug: "support",
    file: "docs/support.md",
    title: "Supported configurations",
    description:
      "See exactly what is supported, local-only, or still needs an adapter.",
    group: "Evaluate",
    order: 20,
    audience: "Technical evaluators and architecture owners",
    lastModified: "2026-07-18",
    keywords: ["support", "Medplum", "HAPI", "compatibility", "status"],
  },
  {
    slug: "architecture",
    file: "docs/architecture.md",
    title: "Architecture",
    description:
      "Trace the chat route, FHIR tool surface, backend adapters, and data boundary.",
    group: "Understand",
    order: 10,
    audience: "Developers reviewing the implementation",
    lastModified: "2026-07-19",
    keywords: ["architecture", "FHIR", "tools", "backend", "data boundary"],
  },
  {
    slug: "approval-gates",
    file: "docs/approval-gates.md",
    title: "Approval-Gated Writes",
    description:
      "Understand the proposal-and-review boundary, including its real limits.",
    group: "Understand",
    order: 20,
    audience: "Clinical, product, and security reviewers",
    lastModified: "2026-07-19",
    keywords: ["approval", "writes", "human review", "safety", "Observation"],
  },
  {
    slug: "agent-write-protocol",
    file: "docs/agent-write-protocol.md",
    title: "Approval-Gated Agent Writes on FHIR",
    description:
      "A small, framework-neutral protocol for agent-initiated, human-approved FHIR writes — v0.1 draft, extracted from this repository's two running implementations.",
    group: "Understand",
    order: 25,
    audience: "Implementers, standards folks, and safety reviewers",
    lastModified: "2026-07-19",
    keywords: ["protocol", "spec", "approval", "agent", "MCP", "CDS Hooks", "Provenance", "AIAST"],
  },
  {
    slug: "threat-model",
    file: "docs/threat-model.md",
    title: "Threat Model",
    description:
      "Review the assets, trust boundaries, intended controls, and known limitations.",
    group: "Understand",
    order: 30,
    audience: "Security and privacy reviewers",
    lastModified: "2026-07-18",
    keywords: ["threat model", "security", "privacy", "PHI", "boundaries"],
  },
  {
    slug: "adapters",
    file: "docs/adapters.md",
    title: "Backend Adapters",
    description:
      "Build a verified FHIR backend adapter with the shared contract harnesses.",
    group: "Build & integrate",
    order: 10,
    audience: "Backend contributors and integration teams",
    lastModified: "2026-07-18",
    keywords: ["adapter", "Aidbox", "Firely", "Oystehr", "contract"],
  },
  {
    slug: "mcp",
    file: "docs/mcp.md",
    title: "MCP Server",
    description:
      "Install bounded FHIR chart tools for MCP clients: read-only by default, with an opt-in human-approved write profile.",
    group: "Build & integrate",
    order: 20,
    audience: "Agent and MCP builders",
    lastModified: "2026-07-19",
    keywords: ["MCP", "Claude", "Medplum", "read only", "approval", "tools"],
  },
  {
    slug: "evals",
    file: "docs/evals.md",
    title: "FHIR Agent Safety Eval",
    description:
      "Run a disposable synthetic workflow evaluation for the web agent's proposal, approval, denial, and cleanup mechanics.",
    group: "Build & integrate",
    order: 30,
    audience: "Adapter contributors and technical evaluators",
    lastModified: "2026-07-19",
    keywords: ["eval", "safety", "approval", "synthetic", "HAPI", "adapter"],
  },
  {
    slug: "conformance",
    file: "docs/conformance.md",
    title: "Protocol Conformance Suite",
    description:
      "Test any implementation of the agent-write protocol with a scripted reviewer and independent FHIR verification.",
    group: "Build & integrate",
    order: 35,
    audience: "Protocol implementers and safety reviewers",
    lastModified: "2026-07-19",
    keywords: ["conformance", "protocol", "MCP", "approval", "AIAST", "suite"],
  },
  {
    slug: "deployment",
    file: "docs/deployment.md",
    title: "Deployment",
    description:
      "Configure environment, rate limits, Docker, and public-demo hardening.",
    group: "Operate & maintain",
    order: 10,
    audience: "Operators and platform teams",
    lastModified: "2026-07-14",
    keywords: ["deployment", "Docker", "environment", "rate limit", "PHI"],
  },
  {
    slug: "metrics",
    file: "docs/metrics.md",
    title: "Adoption Metrics",
    description:
      "Measure OSS adoption without collecting chart content or PHI.",
    group: "Operate & maintain",
    order: 20,
    audience: "Maintainers and growth teams",
    lastModified: "2026-07-09",
    keywords: ["metrics", "analytics", "privacy", "adoption", "PostHog"],
  },
] as const;

export const docsGroups: readonly DocsGroup[] = [
  "Evaluate",
  "Understand",
  "Build & integrate",
  "Operate & maintain",
];

export type DocsHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};

export function getDoc(slug: string): DocsRegistryEntry | undefined {
  return docsRegistry.find((doc) => doc.slug === slug);
}

export function getDocsByGroup(group: DocsGroup): DocsRegistryEntry[] {
  return docsRegistry
    .filter((doc) => doc.group === group)
    .sort((a, b) => a.order - b.order);
}

export function getSourceHref(doc: DocsRegistryEntry): string {
  return `${DOCS_REPOSITORY_URL}/blob/main/${doc.file}`;
}

export function getDocHref(doc: Pick<DocsRegistryEntry, "slug">): string {
  return `/docs/${doc.slug}`;
}

export function getPreviousAndNextDoc(doc: DocsRegistryEntry): {
  previous?: DocsRegistryEntry;
  next?: DocsRegistryEntry;
} {
  const index = docsRegistry.findIndex((entry) => entry.slug === doc.slug);
  return {
    previous: docsRegistry[index - 1],
    next: docsRegistry[index + 1],
  };
}

export function extractHeadings(markdown: string): DocsHeading[] {
  const nextHeadingId = createHeadingIdGenerator();
  const headings: DocsHeading[] = [];
  let inCodeFence = false;

  for (const line of markdown.split(/\r?\n/)) {
    if (/^(```|~~~)/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      continue;
    }

    const match = line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (!match) {
      continue;
    }

    const level = match[1].length as 2 | 3;
    const text = stripMarkdown(match[2]);
    headings.push({
      level,
      text,
      id: nextHeadingId(text),
    });
  }

  return headings;
}

export function slugifyHeading(value: string): string {
  return stripMarkdown(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function createHeadingIdGenerator(): (value: string) => string {
  const seen = new Map<string, number>();

  return (value: string) => {
    const baseId = slugifyHeading(value);
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);
    return count === 0 ? baseId : `${baseId}-${count}`;
  };
}

export function stripMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[\*_~]/g, "")
    .trim();
}
