import type { Metadata } from "next";

import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import {
  ClipboardCheck,
  FileCheck2,
  GitBranch,
  LineChart,
  LockKeyhole,
  ServerCog,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = pageMetadata({
  title: "Roadmap: Approval-Gated FHIR Agents",
  description:
    "Where Last EHR is headed: local adoption, backend adapters, approval workflows, MCP, and safer FHIR agent tools.",
  path: "/roadmap",
  type: "website",
  cardTitle: "Last EHR Roadmap",
  cardDescription:
    "The public roadmap for the open-source approval-gated FHIR agent layer.",
});

const tracks = [
  {
    title: "Demo to Local",
    description:
      "Keep the no-signup demo sharp, make HAPI local mode repeatable, and measure where evaluators drop off.",
    icon: <LineChart className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: "Backend Portability",
    description:
      "Add well-tested adapters for Aidbox, Oystehr, Firely, and other FHIR R4 backends through the FhirBackend contract.",
    icon: <GitBranch className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: "Approval Workflows",
    description:
      "Improve proposed-write previews, rejected-proposal handling, and policy hooks without weakening explicit human review.",
    icon: <ClipboardCheck className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: "Clinical Tool Catalog",
    description:
      "Expand beyond notes and observations carefully: Task, DocumentReference, encounter context, and better unit/coding support.",
    icon: <ServerCog className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: "MCP Safety",
    description:
      "Keep the standalone read-only package auditable; the shipped Local Lab evaluates the bounded surface on fixture data.",
    icon: <LockKeyhole className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: "Safety Evidence",
    description:
      "Grow the shipped synthetic workflow eval into reviewed, retestable evidence for verified backend integrations.",
    icon: <FileCheck2 className="h-5 w-5" aria-hidden="true" />,
  },
];

export default function RoadmapPage() {
  return (
    <>
      <Navbar />
      <main>
        <section className="container max-w-4xl py-16 sm:py-24">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Roadmap
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight md:text-5xl">
            The open-source path for approval-gated FHIR agents
          </h1>
          <p className="mt-6 max-w-2xl text-xl text-muted-foreground">
            Last EHR is intentionally narrow: chart reads, explicit write
            proposals, backend-enforced permissions, and no chart database in
            the layer. The roadmap expands that pattern without turning the
            project into an EHR.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="https://github.com/cbetz/last-ehr/blob/main/ROADMAP.md"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants()}
            >
              Read full roadmap
            </Link>
            <Link href="/docs" className={buttonVariants({ variant: "outline" })}>
              Read docs
            </Link>
          </div>
        </section>

        <section className="container pb-24">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tracks.map(({ title, description, icon }) => (
              <Card key={title} className="bg-transparent">
                <CardHeader className="space-y-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground">
                    {icon}
                  </div>
                  <CardTitle className="text-base">{title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-relaxed text-muted-foreground">
                  {description}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="container max-w-4xl pb-24">
          <h2 className="text-2xl font-bold">How to help</h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Small PRs are preferred. Adapters, docs, and demo polish are all in
            reach for a first contribution.
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link
              href="https://github.com/cbetz/last-ehr/labels/good%20first%20issue"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants()}
            >
              Good first issues
            </Link>
            <Link
              href="https://github.com/cbetz/last-ehr/discussions"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline" })}
            >
              Join the discussion
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
