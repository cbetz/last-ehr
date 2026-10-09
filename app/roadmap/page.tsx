import type { Metadata } from "next";

import { pageMetadata } from "@/lib/seo";
import Link from "next/link";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = pageMetadata({
  title: "Roadmap",
  description:
    "What Last EHR supports today and what comes next: chart reads, approved writes, MCP, and FHIR backend verification.",
  path: "/roadmap",
  type: "website",
  cardTitle: "Last EHR Roadmap",
  cardDescription:
    "Available now, current limits, and the next work for Last EHR.",
});

const available = [
  {
    title: "Chart reads and approved writes",
    description:
      "The web agent and MCP package share four read tools: patient search, chart overview, filtered sections, and document text. Write tools propose notes, observations, linked corrections, and follow-up tasks. Each write needs human approval; a correction adds a new observation and leaves the original in place.",
  },
  {
    title: "MCP over stdio or HTTP",
    description:
      "MCP is read-only by default, with approved writes available by opt-in. Version 0.4.0 adds an optional HTTP transport with OAuth and a separate FHIR credential for each caller. Stdio remains the default. The HTTP path still needs a live run with a real identity provider and Medplum.",
  },
  {
    title: "Five FHIR backend adapters",
    description:
      "Medplum is the supported authenticated path. The included HAPI stack runs locally without credentials. Firely Server, Aidbox, and Oystehr have passed the synthetic backend checks. These evaluation paths are for synthetic data; authentication and permissions remain the backend’s responsibility.",
  },
  {
    title: "Write controls and audit records",
    description:
      "Approved writes carry an AI assistance label. Operators can enable Provenance records, an audit trail for rejected proposals, and policy hooks that can block a write before review or commit. A policy never replaces the human decision.",
  },
  {
    title: "A local walkthrough and conformance suite",
    description:
      "The local HAPI walkthrough needs no account or model key. CI checks the browser approval flow, synthetic workflow evaluator, and write-protocol conformance suite against that stack. These checks verify the mechanics of reads and writes; they do not establish clinical accuracy.",
  },
];

const next = [
  {
    title: "Verify remote MCP with a real identity provider",
    description:
      "Run the complete HTTP path from an MCP client through OAuth and token exchange to Medplum. Record the provider setup, caller permissions, and end-to-end result.",
  },
  {
    title: "Extend terminology beyond vitals",
    description:
      "Measurement names currently resolve through a curated LOINC table. Add reviewed code mappings for problems, medications, and vaccines, plus explicit laboratory coding.",
  },
  {
    title: "Complete the remaining reference coverage",
    description:
      "Add reference-based fixtures and verification for Medication and PractitionerRole, the two remaining US Core resource types. The existing reference reader is the starting point.",
  },
  {
    title: "Make backend evidence easier to repeat",
    description:
      "Record the backend version, Last EHR revision, report, and retest date for each verified adapter so the checks can be repeated against the same setup.",
  },
  {
    title: "Test the write protocol independently",
    description:
      "The Approval-Gated Agent Writes on FHIR protocol is a v0.1 draft. Recruit another implementation and use the conformance suite to find gaps in the specification.",
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
            What works today, and what comes next
          </h1>
          <p className="mt-6 max-w-2xl text-xl text-muted-foreground">
            Last EHR is an alpha agent layer over a FHIR backend. Use synthetic
            data while evaluating it. The current work improves chart reads,
            human approval, and the evidence that each integration works.
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

        {[
          { heading: "Available now", items: available },
          { heading: "Next", items: next },
        ].map(({ heading, items }) => (
          <section key={heading} className="container max-w-4xl pb-24">
            <h2 className="text-2xl font-bold">{heading}</h2>
            <dl className="mt-8 divide-y border-y">
              {items.map(({ title, description }) => (
                <div
                  key={title}
                  className="grid gap-3 py-6 sm:grid-cols-[14rem_1fr] sm:gap-8"
                >
                  <dt className="font-medium">{title}</dt>
                  <dd className="leading-relaxed text-muted-foreground">
                    {description}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <section className="container max-w-4xl pb-24">
          <h2 className="text-2xl font-bold">How to help</h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Small PRs are welcome. Start with a reproducible bug, a documentation
            correction, or an adapter test. Discuss changes to clinical tools
            before adding them.
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
