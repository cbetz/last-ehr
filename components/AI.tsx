import Link from "next/link";
import { ArrowRight, Braces, LockKeyhole, ScanSearch } from "lucide-react";

const proofItems = [
  {
    icon: ScanSearch,
    label: "Inspectable surface",
    detail: "Four focused FHIR tools—not an opaque integration layer.",
  },
  {
    icon: LockKeyhole,
    label: "Read-only by default",
    detail: "The MCP server starts without write tools exposed.",
  },
  {
    icon: Braces,
    label: "Portable by design",
    detail: "A small adapter contract keeps backend work scoped and testable.",
  },
];

export default function AISection() {
  return (
    <section className="border-y border-border/70 bg-muted/30">
      <div className="container grid gap-12 py-20 sm:py-28 lg:grid-cols-[0.83fr_1.17fr] lg:items-center">
        <div className="max-w-xl">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary">
            Built to be inspected
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
            A clear interface between an agent and clinical infrastructure.
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            The useful work is small and legible: search a patient, view chart
            context, propose a note, or propose an observation. The code and
            the behavior stay close enough to reason about.
          </p>
          <Link
            href="/docs"
            className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
          >
            Explore the technical docs
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="overflow-hidden rounded-[1.35rem] border border-border bg-card shadow-[0_24px_65px_-42px_hsl(var(--foreground)/0.75)]">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2 font-mono">
              <span className="h-2 w-2 rounded-full bg-primary" />
              fhir-tool / proposed-write
            </span>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-medium text-primary">
              waiting for approval
            </span>
          </div>
          <div className="grid gap-px bg-border/80 md:grid-cols-[1.05fr_0.95fr]">
            <div className="bg-card p-5 sm:p-6">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-primary">Agent intent</p>
              <pre className="mt-5 overflow-x-auto font-mono text-[0.78rem] leading-6 text-muted-foreground">
                <code>{`record_observation({
  patientId: "synthetic-004",
  label: "Heart rate",
  value: 72,
  unit: "bpm"
})`}</code>
              </pre>
              <div className="mt-5 border-t border-border pt-4 font-mono text-[0.7rem] text-muted-foreground">
                <span className="text-primary">needsApproval</span>: true
              </div>
            </div>
            <div className="bg-background p-5 sm:p-6">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-primary">Visible review</p>
              <div className="mt-5 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">Record observation?</span>
                  <span className="rounded-md border border-border px-2 py-1 font-mono text-[0.62rem] text-muted-foreground">Observation</span>
                </div>
                <dl className="mt-4 grid gap-2 text-sm">
                  <div className="flex justify-between gap-4 border-b border-border/70 pb-2">
                    <dt className="text-muted-foreground">Patient</dt>
                    <dd className="font-medium">Maria Garcia</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-border/70 pb-2">
                    <dt className="text-muted-foreground">Value</dt>
                    <dd className="font-medium">72 bpm</dd>
                  </div>
                </dl>
                <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs font-semibold">
                  <span className="rounded-lg border border-border px-3 py-2 text-muted-foreground">Cancel</span>
                  <span className="rounded-lg bg-primary px-3 py-2 text-primary-foreground">Approve &amp; save</span>
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-px border-t border-border bg-border/80 sm:grid-cols-3">
            {proofItems.map(({ icon: Icon, label, detail }) => (
              <div key={label} className="bg-card p-4">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                <p className="mt-4 text-sm font-semibold">{label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
