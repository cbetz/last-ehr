import Link from "next/link";
import { ArrowRight, Check, Layers, ScanSearch } from "lucide-react";

import {
  CHART_SECTION_COUNT,
  HONESTY_GUARDS,
  PROPOSAL_TOOL_COUNT,
  READ_TOOL_COUNT,
  TOOL_COUNT,
  US_CORE_READABLE_TYPES,
  US_CORE_TYPES_COVERED,
  US_CORE_TYPES_REMAINING,
  US_CORE_VERSION,
} from "@/lib/coverage";

// Every number here comes from lib/coverage.ts, which lib/coverage.test.ts
// pins to the shipped reader and tool catalog. The published tool manifest
// drifted to 5 of 8 tools once; these figures cannot drift the same way.
const figures = [
  {
    value: `${US_CORE_TYPES_COVERED} / ${US_CORE_READABLE_TYPES}`,
    label: `US Core ${US_CORE_VERSION} readable resource types`,
  },
  {
    value: String(CHART_SECTION_COUNT),
    label: "patient-scoped chart sections, each with code and date filters",
  },
  {
    value: String(TOOL_COUNT),
    label: `tools: ${READ_TOOL_COUNT} reads and ${PROPOSAL_TOOL_COUNT} approval-gated proposals`,
  },
];

export function CoverageSection() {
  return (
    <section id="coverage" className="border-b marketing-rule">
      <div className="container py-20 sm:py-28">
        <div className="grid gap-8 border-b border-border pb-9 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <p className="section-kicker">What the agent can reach</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.052em] sm:text-5xl sm:leading-[1.02]">
              Breadth is a number, not an adjective.
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            An agent that reads a thin chart gives thin answers. This one reads
            widely and publishes the count, with the ceiling stated rather than
            implied. There is no percentage of FHIR R4 on this page on purpose:
            the denominator is US Core, because that is the floor US
            implementers are asked about.
          </p>
        </div>

        <dl className="grid divide-y divide-border border-b border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {figures.map(({ value, label }) => (
            <div key={label} className="py-7 sm:px-6 sm:first:pl-0 sm:last:pr-0">
              <dt className="font-mono text-4xl font-semibold tracking-[-0.04em] text-primary sm:text-5xl">
                {value}
              </dt>
              <dd className="mt-3 text-sm leading-6 text-muted-foreground">{label}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-10 pt-9 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <div>
            <h3 className="inline-flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]">
              <ScanSearch className="h-4 w-4 text-primary" aria-hidden="true" />
              It cannot report an absence it never checked for
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              &ldquo;She has never had a flu shot&rdquo; is the answer a chart
              agent must never invent. Each guard below is a test, and each one
              came from a real false negative found against a live FHIR server.
            </p>
            <ul className="mt-5 space-y-2.5">
              {HONESTY_GUARDS.map((guard) => (
                <li key={guard} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                  <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  {guard}
                </li>
              ))}
            </ul>
          </div>

          <div className="border border-border bg-muted/25 p-5">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
              The ceiling, stated
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {US_CORE_TYPES_REMAINING.join(" and ")} are the{" "}
              {US_CORE_TYPES_REMAINING.length} US Core types still out of reach.
              Both need no new mechanism, only data that models them as
              references rather than inline codeable concepts.
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Practitioner, Organization, Location, and Provenance have no
              patient search parameter, so the agent follows a reference to
              them instead of reading them as a section.
            </p>
            <Link
              href="/docs/fhir-coverage"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
            >
              Read the counted coverage
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
