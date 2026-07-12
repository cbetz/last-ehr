import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleDotDashed,
  ShieldCheck,
} from "lucide-react";

import { buttonVariants } from "./ui/button";
import { IconGitHub } from "./ui/icons";

const proofPoints = [
  "Apache-2.0 reference implementation",
  "Read-only MCP surface",
  "Synthetic-first local evaluation",
];

const ledgerSteps = [
  ["01", "Intent", "Record heart rate: 72 bpm"],
  ["02", "Proposal", "FHIR Observation / not persisted"],
  ["03", "Decision", "Explicit reviewer approval required"],
  ["04", "Write", "Backend policy is still enforced"],
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b marketing-rule">
      <div
        aria-hidden="true"
        className="marketing-grid pointer-events-none absolute inset-x-0 top-0 h-[29rem] opacity-45 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div className="container relative grid gap-14 py-14 sm:py-20 lg:grid-cols-[0.91fr_1.09fr] lg:items-center lg:gap-16 lg:py-24">
        <div className="max-w-2xl">
          <p className="section-kicker inline-flex items-center gap-2">
            <CircleDotDashed className="h-3.5 w-3.5" aria-hidden="true" />
            Open-source clinical agent infrastructure
          </p>
          <h1 className="mt-6 max-w-3xl text-[clamp(3rem,5.4vw,5rem)] font-semibold leading-[0.96] tracking-[-0.07em] text-balance">
            Add human-approved <span className="text-primary">AI writeback</span> to your FHIR app.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9">
            Last EHR is the open-source reference implementation for that
            boundary: the agent reads chart context, makes structured
            proposals, and stops until a person and the FHIR backend authorize
            the write.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/demo"
              className={buttonVariants({
                size: "lg",
                className: "group h-12 rounded-sm px-5 text-[0.94rem]",
              })}
            >
              Open the synthetic demo
              <ArrowRight
                className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
            <Link
              href="/docs/mcp#zero-credential-local-lab-checkout-only"
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "h-12 rounded-sm px-5 text-[0.94rem]",
              })}
            >
              Run the MCP Local Lab
            </Link>
          </div>

          <div className="mt-8 grid gap-2 border-y marketing-rule py-4 text-sm text-muted-foreground sm:grid-cols-3 sm:gap-4">
            {proofPoints.map((point) => (
              <span key={point} className="inline-flex items-start gap-2 leading-5">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                {point}
              </span>
            ))}
          </div>

          <Link
            href="https://github.com/cbetz/last-ehr"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconGitHub className="h-4 w-4" aria-hidden="true" />
            Inspect the implementation
          </Link>
        </div>

        <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
          <div className="border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Clinical action ledger
              </span>
              <span className="text-primary">write / paused</span>
            </div>
            <div className="grid border-b border-border sm:grid-cols-[0.78fr_1.22fr]">
              <div className="border-b border-border p-4 sm:border-b-0 sm:border-r sm:p-5">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.13em] text-muted-foreground">
                  Agent request
                </p>
                <pre className="mt-5 overflow-x-auto font-mono text-[0.79rem] leading-6 text-foreground">
                  <code>{`record_observation({
  patientId: "<synthetic-patient-id>",
  label: "Heart rate",
  value: 72,
  unit: "bpm"
})`}</code>
                </pre>
                <p className="mt-5 border-t border-border pt-3 font-mono text-[0.72rem] text-primary">
                  needsApproval: true
                </p>
              </div>
              <ol className="divide-y divide-border">
                {ledgerSteps.map(([number, title, description]) => (
                  <li key={number} className="grid grid-cols-[2.5rem_1fr] gap-3 px-4 py-3.5 sm:px-5">
                    <span className="font-mono text-xs text-primary">{number}</span>
                    <span>
                      <span className="block text-sm font-semibold">{title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="grid divide-y divide-border border-t border-border bg-muted/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="px-4 py-4 sm:px-5">
                <span className="block font-mono text-[0.62rem] uppercase tracking-[0.13em] text-muted-foreground">Resource</span>
                <span className="mt-1.5 block text-sm font-semibold">FHIR Observation</span>
              </div>
              <div className="px-4 py-4 sm:px-5">
                <span className="block font-mono text-[0.62rem] uppercase tracking-[0.13em] text-muted-foreground">Persistence</span>
                <span className="mt-1.5 block text-sm font-semibold text-primary">Blocked pending review</span>
              </div>
              <div className="px-4 py-4 sm:px-5">
                <span className="block font-mono text-[0.62rem] uppercase tracking-[0.13em] text-muted-foreground">Authority</span>
                <span className="mt-1.5 block text-sm font-semibold">FHIR backend policy</span>
              </div>
            </div>
          </div>
          <p className="mt-3 font-mono text-[0.67rem] leading-5 text-muted-foreground">
            The UI is not the authorization layer. It makes the proposed change
            inspectable before the backend receives it.
          </p>
        </div>
      </div>
    </section>
  );
}
