import Link from "next/link";
import { ArrowRight, CircleDotDashed, ClipboardCheck } from "lucide-react";

import { buttonVariants } from "./ui/button";

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b marketing-rule">
      <div
        aria-hidden="true"
        className="marketing-grid pointer-events-none absolute inset-x-0 top-0 h-[29rem] opacity-45 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div className="container relative grid gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16">
        <div>
          <p className="section-kicker inline-flex items-center gap-2">
            <CircleDotDashed className="h-3.5 w-3.5" aria-hidden="true" />
            Open source · Alpha
          </p>
          <h1 className="mt-5 text-[clamp(2.7rem,5vw,4.6rem)] font-semibold leading-[1.02] tracking-[-0.065em] text-balance">
            AI tools for <span className="text-primary">FHIR patient charts.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9">
            Search patients, read their charts, and draft notes, observations,
            and follow-up tasks. Review each proposed change before it is saved
            to your FHIR backend.
          </p>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            Use the web app or connect your own agent through MCP.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/demo"
              className={buttonVariants({ size: "lg", className: "h-12 rounded-sm px-5" })}
            >
              Try the demo
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/docs/quickstart"
              className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 rounded-sm px-5" })}
            >
              Run locally
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            The demo uses synthetic patients. No sign-up required.
          </p>
        </div>

        <figure className="min-w-0 border border-border bg-card">
          <figcaption className="border-b border-border px-5 py-4 font-mono text-xs text-muted-foreground">
            Example · Synthetic patient
          </figcaption>
          <div className="p-5 sm:p-7">
            <p className="text-sm text-muted-foreground">You ask</p>
            <p className="mt-2 text-xl font-medium leading-8 tracking-tight">
              “Record a heart rate of 72 bpm for Maria Garcia.”
            </p>
            <div className="mt-7 border border-border bg-background">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
                <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                Proposed observation
              </div>
              <dl className="divide-y divide-border px-4">
                {[
                  ["Patient", "Maria Garcia"],
                  ["Measurement", "Heart rate"],
                  ["Value", "72 bpm"],
                  ["FHIR resource", "Observation"],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="border-t border-border bg-muted/30 px-4 py-3 text-sm font-medium text-primary">
                Waiting for your approval. Nothing saved yet.
              </p>
            </div>
            <Link href="/demo" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold hover:text-primary">
              Try this in the demo
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </figure>
      </div>
    </section>
  );
}
