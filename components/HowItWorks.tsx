import Link from "next/link";
import { ArrowRight, Database, Eye, ShieldCheck, Stethoscope } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Eye,
    title: "Read the clinical context",
    description:
      "The agent uses a deliberately small FHIR tool surface to search, retrieve, and render chart context.",
  },
  {
    number: "02",
    icon: Stethoscope,
    title: "Propose a structured change",
    description:
      "A note or observation is expressed as an explicit FHIR resource proposal—not an invisible side effect.",
  },
  {
    number: "03",
    icon: ShieldCheck,
    title: "Pause for human review",
    description:
      "The write tool stops. The person reviewing sees what will be saved and can approve or cancel it.",
  },
];

export function HowItWorks() {
  return (
    <section id="workflow" className="container py-20 sm:py-28">
      <div className="max-w-2xl">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary">
          The write path
        </p>
        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
          A safety boundary you can inspect.
        </h2>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          Last EHR does not make a backend safer by pretending to replace its
          controls. It makes the agent&apos;s intent visible, then leaves the
          authorization decision with the person and the system of record.
        </p>
      </div>

      <div className="mt-12 grid gap-px overflow-hidden rounded-[1.35rem] border border-border bg-border/80 md:grid-cols-3">
        {steps.map(({ number, icon: Icon, title, description }) => (
          <article key={number} className="group bg-background p-7 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <span className="font-mono text-xs text-primary">{number}</span>
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-primary transition-transform duration-300 group-hover:-translate-y-1">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <h3 className="mt-10 text-lg font-semibold tracking-[-0.025em]">{title}</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
          </article>
        ))}
      </div>

      <div className="mt-7 grid gap-6 rounded-[1.35rem] border border-border bg-muted/35 p-6 sm:p-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Database className="h-4 w-4" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em]">
            The backend remains the security boundary.
          </h3>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            In the authenticated Medplum path, every call runs under the
            signed-in user&apos;s access policy. The local HAPI path is a
            deliberately restricted synthetic evaluation environment—not a
            deployment shortcut.
          </p>
        </div>
        <div className="grid gap-3 font-mono text-xs text-muted-foreground sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
          <div className="rounded-xl border border-border bg-background px-4 py-3">
            <span className="block text-[0.62rem] uppercase tracking-[0.14em] text-primary">System of record</span>
            <span className="mt-1.5 block text-foreground">FHIR backend</span>
          </div>
          <ArrowRight className="mx-auto h-4 w-4 rotate-90 text-primary sm:rotate-0" aria-hidden="true" />
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
            <span className="block text-[0.62rem] uppercase tracking-[0.14em] text-primary">Agent layer</span>
            <span className="mt-1.5 block text-foreground">proposal</span>
          </div>
          <ArrowRight className="mx-auto h-4 w-4 rotate-90 text-primary sm:rotate-0" aria-hidden="true" />
          <div className="rounded-xl border border-border bg-background px-4 py-3">
            <span className="block text-[0.62rem] uppercase tracking-[0.14em] text-primary">Decision</span>
            <span className="mt-1.5 block text-foreground">review + policy</span>
          </div>
        </div>
      </div>

      <Link
        href="/approval-gated-writes"
        className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
      >
        Read the approval model
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
