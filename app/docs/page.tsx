import type { Metadata } from "next";

import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Braces,
  Check,
  ClipboardCheck,
  FileText,
  GitBranch,
  Rocket,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from "lucide-react";

import { DocsSearch } from "@/components/docs/docs-search";
import { buttonVariants } from "@/components/ui/button";
import { getDocsSearchIndex } from "@/lib/docs/content";

export const metadata: Metadata = pageMetadata({
  title: "Docs: Build an Approval-Gated FHIR Agent",
  description:
    "Evaluate Last EHR locally, inspect the approval boundary, connect bounded MCP reads, run the synthetic workflow eval, and build FHIR backend adapters.",
  path: "/docs",
  type: "website",
  cardTitle: "Last EHR Docs",
  cardDescription:
    "A practical path to evaluate, inspect, verify, and extend approval-gated FHIR agents.",
});

const paths = [
  {
    number: "01",
    title: "Evaluate locally",
    description:
      "Run a synthetic HAPI stack and a deterministic, approval-gated walkthrough without a model key.",
    href: "/docs/quickstart#zero-key-local-synthetic-demo-with-hapi-fhir",
    icon: Rocket,
  },
  {
    number: "02",
    title: "Inspect MCP locally",
    description:
      "Prepare fixture-restricted HAPI data and connect two read-only tools without FHIR credentials.",
    href: "/docs/mcp#zero-credential-local-lab-checkout-only",
    icon: Braces,
  },
  {
    number: "03",
    title: "Run the Safety Eval",
    description:
      "Generate a scrubbed synthetic report for proposal, approval, denial, association, and cleanup mechanics.",
    href: "/docs/evals",
    icon: ClipboardCheck,
  },
  {
    number: "04",
    title: "Integrate Medplum",
    description:
      "Connect the authenticated path, bring your own model provider, and rely on backend access policy.",
    href: "/docs/quickstart#medplum-backed-demo",
    icon: ShieldCheck,
  },
  {
    number: "05",
    title: "Extend a backend",
    description:
      "Start from the executable adapter starter and prove the FHIR contract against synthetic data.",
    href: "/docs/adapters",
    icon: GitBranch,
  },
];

const docCollections = [
  {
    eyebrow: "Start and orient",
    title: "Get the operating context first",
    docs: [
      {
        title: "Quickstart",
        description: "Hosted demo, Medplum integration, and the local HAPI path.",
        href: "/docs/quickstart",
        icon: Rocket,
      },
      {
        title: "Support status",
        description: "Supported, local-evaluation-only, and unverified configurations.",
        href: "/docs/support",
        icon: ShieldCheck,
      },
      {
        title: "Architecture",
        description: "How the route, FHIR tools, and backend boundary fit together.",
        href: "/docs/architecture",
        icon: BookOpen,
      },
    ],
  },
  {
    eyebrow: "Understand the safety boundary",
    title: "Know the limits before adding capability",
    docs: [
      {
        title: "Approval-gated writes",
        description: "What the proposal-and-review pattern protects, and what it cannot prove.",
        href: "/docs/approval-gates",
        icon: ClipboardCheck,
      },
      {
        title: "Threat model",
        description: "Trust boundaries, prompt risks, and deployment assumptions.",
        href: "/docs/threat-model",
        icon: ShieldAlert,
      },
      {
        title: "MCP server",
        description: "Read-only by default (Medplum or local HAPI) with an opt-in human-approved write profile, plus a fixture-restricted checkout Local Lab.",
        href: "/docs/mcp",
        icon: Braces,
      },
      {
        title: "FHIR Agent Safety Eval",
        description: "A scrubbed synthetic workflow report for the web agent's approval mechanics.",
        href: "/docs/evals",
        icon: ClipboardCheck,
      },
    ],
  },
  {
    eyebrow: "Operate and contribute",
    title: "Take it from reference app to your environment",
    docs: [
      {
        title: "Deployment",
        description: "Environment variables, Docker, rate limiting, and public demo hardening.",
        href: "/docs/deployment",
        icon: ServerCog,
      },
      {
        title: "Backend adapters",
        description: "Contract harnesses, an executable bearer-token starter, and verification steps.",
        href: "/docs/adapters",
        icon: GitBranch,
      },
      {
        title: "Adoption metrics",
        description: "Measure OSS usage without sending chart content to analytics.",
        href: "/docs/metrics",
        icon: FileText,
      },
    ],
  },
];

function DocumentLink({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: typeof Rocket;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-36 flex-col border border-border bg-background p-5 transition-colors hover:border-primary/50 hover:bg-muted/30"
    >
      <span className="flex items-start justify-between gap-4">
        <span className="grid h-9 w-9 place-items-center border border-primary/25 bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
      </span>
      <span className="mt-5 text-sm font-semibold text-foreground">{title}</span>
      <span className="mt-2 text-xs leading-5 text-muted-foreground">{description}</span>
    </Link>
  );
}

export default async function DocsPage() {
  const searchIndex = await getDocsSearchIndex();

  return (
      <main>
        <section className="border-b marketing-rule">
          <div className="container py-16 sm:py-24 lg:py-28">
            <div className="max-w-3xl">
              <p className="section-kicker inline-flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Documentation
              </p>
              <h1 className="mt-6 text-[clamp(3rem,7vw,5.2rem)] font-semibold tracking-[-0.07em] text-balance sm:leading-[0.95]">
                Get to a responsible first integration faster.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9">
                A guided path through local evaluation, safety boundaries,
                supported configurations, and the small adapter contract behind
                Last EHR.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/docs/quickstart#zero-key-local-synthetic-demo-with-hapi-fhir" className={buttonVariants({ size: "lg", className: "h-12 rounded-sm px-5" })}>
                  Start locally
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="https://github.com/cbetz/last-ehr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 rounded-sm px-5" })}
                >
                  Browse source
                  <ArrowUpRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <div className="mt-7">
                <DocsSearch docs={searchIndex} />
                <p className="mt-3 text-xs text-muted-foreground">
                  Press <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[0.68rem]">⌘ / Ctrl K</kbd> to search the guide library. Search stays in your browser.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="local" className="container scroll-mt-24 py-20 sm:py-28">
          <div className="grid gap-10 border border-border bg-card p-6 sm:p-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div className="max-w-md">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary">
                The shortest path
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                See the full approval loop, without a model key.
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">
                This explicitly limited local mode starts HAPI FHIR, seeds only
                synthetic data, and runs one fixed Maria Garcia / 72 bpm
                observation proposal. It does not read arbitrary charts or
                call an external model provider.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                {["No account or .env.local required", "No external model request", "One visible approval before the synthetic write"].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="overflow-hidden border border-border bg-[#11152b] text-[#eef3ff]">
                <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.035] px-5 py-3 font-mono text-[0.68rem] text-[#98a8c7]">
                  <span className="inline-flex items-center gap-2">
                    <Terminal className="h-3.5 w-3.5 text-[#8eb6ff]" aria-hidden="true" />
                    ZERO-KEY EVALUATION
                  </span>
                  <span>localhost:3000</span>
                </div>
                <pre className="overflow-x-auto p-6 font-mono text-sm leading-7 sm:p-8 sm:text-[0.95rem]">
                  <code><span className="text-[#7183a7]">$</span> npm install{`\n`}<span className="text-[#7183a7]">$</span> npm run demo:local</code>
                </pre>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ["01", "Start", "Docker Compose brings up HAPI and Postgres."],
                  ["02", "Seed", "The repository creates its synthetic records."],
                  ["03", "Review", "The scripted agent stops before the write."],
                ].map(([number, title, description]) => (
                  <div key={number} className="border border-border bg-muted/30 p-4">
                    <span className="font-mono text-xs text-primary">{number}</span>
                    <p className="mt-3 text-sm font-semibold">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-muted/20">
          <div className="container py-20 sm:py-28">
            <div className="max-w-2xl">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary">
                Choose a path
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Start where your architecture actually is.
              </h2>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
              {paths.map(({ number, title, description, href, icon: Icon }) => {
                const external = href.startsWith("http");
                return (
                  <Link
                    key={number}
                    href={href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    className="group border border-border bg-background p-6 transition-colors hover:border-primary/50 hover:bg-muted/30"
                  >
                    <span className="flex items-center justify-between">
                      <span className="font-mono text-xs text-primary">{number}</span>
                      <span className="grid h-10 w-10 place-items-center border border-primary/25 bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                    </span>
                    <span className="mt-10 block text-xl font-semibold tracking-[-0.03em] text-foreground">{title}</span>
                    <span className="mt-3 block text-sm leading-6 text-muted-foreground">{description}</span>
                    <span className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-foreground group-hover:text-primary">
                      Continue
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="container py-20 sm:py-28">
          <div className="max-w-2xl">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary">
              Reference library
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
              Documentation organized around real decisions.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Each guide states the scope, the verification path, and the
              caveats needed to make an informed call, not just the happy path.
            </p>
          </div>

          <div className="mt-12 space-y-12">
            {docCollections.map(({ eyebrow, title, docs }) => (
              <section key={title}>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.15em] text-primary">{eyebrow}</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{title}</h3>
                  </div>
                  <Link
                    href="https://github.com/cbetz/last-ehr/tree/main/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View Markdown source
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {docs.map((doc) => (
                    <DocumentLink key={doc.title} {...doc} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="border-t border-border/70 bg-muted/20">
          <div className="container py-20 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary">
                Support at a glance
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                The product boundary is part of the documentation.
              </h2>
            </div>
            <div className="mt-10 overflow-x-auto border border-border bg-background">
              <div className="grid min-w-[44rem] grid-cols-[1.1fr_0.8fr_1.35fr] gap-px bg-border text-sm">
                <div className="bg-muted/40 p-4 font-semibold">Configuration</div>
                <div className="bg-muted/40 p-4 font-semibold">Status</div>
                <div className="bg-muted/40 p-4 font-semibold">What that means</div>
                <div className="bg-background p-4">Medplum, hosted or self-hosted</div>
                <div className="bg-background p-4"><span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">Supported</span></div>
                <div className="bg-background p-4 text-muted-foreground">Authenticated path with backend identity, policy, and audit controls.</div>
                <div className="bg-background p-4">Included HAPI Docker stack</div>
                <div className="bg-background p-4"><span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted-foreground">Local only</span></div>
                <div className="bg-background p-4 text-muted-foreground">Synthetic, single-tenant evaluation, not a general deployment path.</div>
                <div className="bg-background p-4">Other FHIR R4 backends</div>
                <div className="bg-background p-4"><span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted-foreground">Adapter wanted</span></div>
                <div className="bg-background p-4 text-muted-foreground">Start from the contract harness and document the auth and verification story.</div>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              Read the complete <Link href="/docs/support" className="font-semibold text-foreground underline decoration-primary/60 underline-offset-4">support matrix</Link> before choosing a deployment path.
            </p>
          </div>
        </section>
      </main>
  );
}
