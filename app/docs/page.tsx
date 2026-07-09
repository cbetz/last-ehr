import type { Metadata } from "next";
import Link from "next/link";
import {
  Boxes,
  ClipboardCheck,
  FileText,
  GitBranch,
  Rocket,
  ServerCog,
  ShieldAlert,
  TerminalSquare,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Docs: Build an Approval-Gated FHIR Agent",
  description:
    "Last EHR documentation: quickstart, architecture, backend adapters, approval-gated writes, MCP, deployment, and threat model.",
  alternates: { canonical: "/docs" },
  openGraph: {
    type: "website",
    title: "Last EHR Docs",
    description:
      "Run the demo locally, inspect the approval gate, add FHIR backend adapters, and deploy Last EHR.",
    url: "https://www.lastehr.com/docs",
    images: ["https://www.lastehr.com/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Last EHR Docs",
    description:
      "Quickstart, architecture, backend adapters, approval-gated writes, MCP, deployment, and threat model.",
  },
};

const docs = [
  {
    title: "Quickstart",
    description:
      "Run the hosted demo, Medplum-backed demo, or fully local HAPI stack.",
    href: "https://github.com/cbetz/last-ehr/blob/main/docs/quickstart.md",
    icon: <Rocket className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: "Architecture",
    description:
      "Understand the chat route, FHIR tools, backend adapters, and data boundary.",
    href: "https://github.com/cbetz/last-ehr/blob/main/docs/architecture.md",
    icon: <Boxes className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: "Backend Adapters",
    description:
      "Implement the FhirBackend contract for Aidbox, Oystehr, Firely, or another FHIR R4 server.",
    href: "https://github.com/cbetz/last-ehr/blob/main/docs/adapters.md",
    icon: <GitBranch className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: "Approval Gates",
    description:
      "See what the write gate protects, what it does not, and where the pattern goes next.",
    href: "https://github.com/cbetz/last-ehr/blob/main/docs/approval-gates.md",
    icon: <ClipboardCheck className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: "MCP",
    description:
      "Expose the same chart tools to MCP clients, read-only by default.",
    href: "https://github.com/cbetz/last-ehr/blob/main/docs/mcp.md",
    icon: <TerminalSquare className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: "Deployment",
    description:
      "Configure env vars, rate limiting, Docker, and public-demo hardening.",
    href: "https://github.com/cbetz/last-ehr/blob/main/docs/deployment.md",
    icon: <ServerCog className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: "Threat Model",
    description:
      "Review trust boundaries, known limitations, and contributor safety rules.",
    href: "https://github.com/cbetz/last-ehr/blob/main/docs/threat-model.md",
    icon: <ShieldAlert className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: "Adoption Metrics",
    description:
      "Separate OSS adoption from hosted-interest tracking without capturing chart content.",
    href: "https://github.com/cbetz/last-ehr/blob/main/docs/metrics.md",
    icon: <FileText className="h-5 w-5" aria-hidden="true" />,
  },
];

export default function DocsPage() {
  return (
    <>
      <Navbar />
      <main>
        <section className="container max-w-4xl py-16 sm:py-24">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Documentation
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight md:text-5xl">
            Build and verify an approval-gated FHIR agent
          </h1>
          <p className="mt-6 max-w-2xl text-xl text-muted-foreground">
            Start with the live demo, then run the same four tools locally,
            inspect the backend adapter seam, and understand the safety
            boundary before expanding the agent.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/demo" className={buttonVariants()}>
              Try the live demo
            </Link>
            <Link
              href="https://github.com/cbetz/last-ehr"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline" })}
            >
              View source
            </Link>
          </div>
        </section>

        <section className="container pb-20">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {docs.map(({ title, description, href, icon }) => (
              <Card key={title} className="bg-transparent">
                <CardHeader className="space-y-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground">
                    {icon}
                  </div>
                  <CardTitle className="text-base">{title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                  <p>{description}</p>
                  <Link
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Open doc
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="container max-w-4xl pb-24">
          <div className="rounded-lg border bg-muted/40 p-6">
            <h2 className="text-2xl font-semibold">Shortest local path</h2>
            <p className="mt-2 text-muted-foreground">
              For a no-Medplum local demo, set HAPI mode and run the seeded
              synthetic chart.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-md border bg-background p-4 text-sm">
              <code>{`docker compose up -d
npm run fhir:wait
npm run seed
npm run dev`}</code>
            </pre>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
