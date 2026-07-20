import Link from "next/link";
import { ArrowRight, Database, Eye, FileCheck2, ShieldCheck, Stethoscope } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Eye,
    title: "Read a bounded chart surface",
    description:
      "Search and chart reads are explicit tools over FHIR. The backend remains the system of record and access-control boundary.",
  },
  {
    number: "02",
    icon: Stethoscope,
    title: "Represent intent as a proposal",
    description:
      "A note, observation, or follow-up task is shown as a concrete FHIR-shaped change, not hidden as an agent side effect.",
  },
  {
    number: "03",
    icon: ShieldCheck,
    title: "Require a human decision",
    description:
      "The write tool pauses. A reviewer can inspect, approve, or cancel before anything reaches the chart — and every ambiguous outcome fails closed.",
  },
  {
    number: "04",
    icon: FileCheck2,
    title: "Commit what was reviewed, attributably",
    description:
      "Nothing beyond the reviewed proposal saves except mechanical metadata. Every agent write carries the standard AIAST security label, with optional Provenance recording an author agent and a human verifier.",
  },
];

export function HowItWorks() {
  return (
    <section id="safety" className="border-b marketing-rule">
      <div className="container grid gap-12 py-20 sm:py-28 lg:grid-cols-[0.78fr_1.22fr] lg:gap-16">
        <div className="max-w-lg">
          <p className="section-kicker">The safety contract</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.052em] sm:text-5xl sm:leading-[1.02]">
            A clinical write is a workflow, not an API side effect.
          </h2>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Last EHR does not claim to replace backend policy or clinical
            judgment. It gives the agent a small, inspectable surface and
            makes the point of human review impossible to miss.
          </p>
          <Link
            href="/docs/approval-gates"
            className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
          >
            Read the approval model
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="border-y marketing-rule">
          {steps.map(({ number, icon: Icon, title, description }) => (
            <article
              key={number}
              className="grid grid-cols-[3rem_1fr_auto] gap-4 border-b border-border py-5 last:border-b-0 sm:grid-cols-[4rem_1fr_auto] sm:gap-6 sm:py-7"
            >
              <span className="font-mono text-sm text-primary">{number}</span>
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.025em] sm:text-xl">{title}</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
              <span className="mt-0.5 grid h-8 w-8 place-items-center border border-border text-primary sm:h-9 sm:w-9">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
            </article>
          ))}
          <div className="grid gap-px border-t border-border bg-border sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
            <div className="bg-background px-4 py-4">
              <span className="block font-mono text-[0.63rem] uppercase tracking-[0.13em] text-muted-foreground">System of record</span>
              <span className="mt-1.5 block text-sm font-semibold">FHIR backend</span>
            </div>
            <ArrowRight className="m-auto hidden h-4 w-4 text-primary sm:block" aria-hidden="true" />
            <div className="bg-background px-4 py-4">
              <span className="block font-mono text-[0.63rem] uppercase tracking-[0.13em] text-muted-foreground">Agent layer</span>
              <span className="mt-1.5 block text-sm font-semibold">Inspectable proposal</span>
            </div>
            <ArrowRight className="m-auto hidden h-4 w-4 text-primary sm:block" aria-hidden="true" />
            <div className="bg-background px-4 py-4">
              <span className="block font-mono text-[0.63rem] uppercase tracking-[0.13em] text-muted-foreground">Decision</span>
              <span className="mt-1.5 block text-sm font-semibold">Review + policy</span>
            </div>
          </div>
          <div className="flex items-start gap-3 border-t border-border bg-muted/35 px-4 py-4 text-sm leading-6 text-muted-foreground">
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            The backend still decides what the signed-in identity can read or
            write. The local HAPI routes are synthetic evaluation tools, not
            an authorization model.
          </div>
        </div>
      </div>
    </section>
  );
}
