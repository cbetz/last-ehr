import Link from "next/link";
import { ArrowRight } from "lucide-react";

const steps = [
  ["01", "Ask for a change", "Draft a note, record a measurement, or create a follow-up task for a patient."],
  ["02", "Review the proposal", "Check the patient and exact fields. Approve to continue, or reject to leave the chart unchanged."],
  ["03", "Save to FHIR", "An approved proposal creates a resource in your backend, subject to its permissions."],
];

export function HowItWorks() {
  return (
    <section id="safety" className="border-b marketing-rule bg-muted/20">
      <div className="container py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="section-kicker">Write</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
            You review the change before it saves.
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Write tools pause for human approval in both the web app and
            compatible MCP clients. A request from the model is a proposal;
            approval is a separate step.
          </p>
        </div>
        <ol className="mt-9 grid divide-y divide-border border-y border-border md:grid-cols-3 md:divide-x md:divide-y-0">
          {steps.map(([number, title, description]) => (
            <li key={number} className="py-6 md:px-6 md:first:pl-0 md:last:pr-0">
              <span className="font-mono text-sm text-primary">{number}</span>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap items-start justify-between gap-5">
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Current writes create notes, observations, and tasks. They do not
            edit or delete existing records. Agent-created resources carry the
            FHIR AIAST label.
          </p>
          <Link href="/docs/approval-gates" className="inline-flex items-center gap-2 text-sm font-semibold hover:text-primary">
            How approval works
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          The approval step controls writes. In external model modes, chart
          reads are sent to your configured provider as context.
        </p>
      </div>
    </section>
  );
}
