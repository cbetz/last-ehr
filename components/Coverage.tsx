import Link from "next/link";
import { ArrowRight } from "lucide-react";

import {
  CHART_SECTION_COUNT,
  US_CORE_READABLE_TYPES,
  US_CORE_TYPES_COVERED,
  US_CORE_TYPES_REMAINING,
  US_CORE_VERSION,
} from "@/lib/coverage";

const examples = [
  ["Find a patient", "Search by name, then open the patient’s chart."],
  ["Read the chart", "Read medications, allergies, conditions, encounters, lab results, and more."],
  ["Ask a focused question", "Filter a chart section by code or date, and follow references to related records."],
];

export function CoverageSection() {
  return (
    <section id="coverage" className="border-b marketing-rule">
      <div className="container py-16 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div>
            <p className="section-kicker">Read</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
              Start with the patient’s chart.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
              The agent reads from your FHIR backend. Your backend controls
              access and remains the system of record.
            </p>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
              Read results flag truncated searches, unsupported filters, and
              records that could not be retrieved, so the agent has context
              about what it has and has not read.
            </p>
          </div>
          <dl className="divide-y divide-border border-y border-border">
            {examples.map(([title, description]) => (
              <div key={title} className="py-5">
                <dt className="text-base font-semibold">{title}</dt>
                <dd className="mt-2 text-sm leading-6 text-muted-foreground">{description}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mt-10 grid gap-5 border-t border-border pt-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            <span className="font-semibold text-foreground">{CHART_SECTION_COUNT} chart sections</span>
            {" "}cover {US_CORE_TYPES_COVERED} of {US_CORE_READABLE_TYPES} readable
            resource types in US Core {US_CORE_VERSION}, including reference
            lookups. {US_CORE_TYPES_REMAINING.join(" and ")} remain gaps in
            verified coverage.
          </p>
          <Link href="/docs/fhir-coverage" className="inline-flex items-center gap-2 text-sm font-semibold hover:text-primary">
            See chart coverage
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
