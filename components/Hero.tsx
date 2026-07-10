import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, GitBranch, ShieldCheck, Terminal } from "lucide-react";

import demoImage from "@/public/demo.png";

import { IconGitHub } from "./ui/icons";
import { buttonVariants } from "./ui/button";

const proofPoints = [
  "Synthetic local walkthrough",
  "Explicit approval before writes",
  "FHIR stays the system of record",
];

export default function Hero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-border/70">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_82%_18%,hsl(var(--primary)/0.18),transparent_26rem),radial-gradient(circle_at_14%_86%,hsl(var(--primary)/0.1),transparent_24rem)]"
      />
      <div className="container grid gap-14 py-16 sm:py-24 lg:grid-cols-[minmax(0,0.95fr)_minmax(30rem,1.05fr)] lg:items-center lg:py-28 xl:gap-20">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Open-source FHIR agent layer
          </div>
          <h1 className="mt-7 max-w-3xl text-5xl font-semibold tracking-[-0.065em] text-balance sm:text-6xl lg:text-7xl lg:leading-[0.96]">
            AI can work the chart.
            <span className="block text-primary">It should not write it unattended.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9">
            Last EHR is an open-source reference implementation for agents that
            read clinical context, propose structured FHIR changes, and wait for
            a person to explicitly approve every write.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/docs#local"
              className={buttonVariants({
                size: "lg",
                className:
                  "group h-12 rounded-full px-6 text-[0.95rem] shadow-[0_16px_38px_-20px_hsl(var(--primary))]",
              })}
            >
              Run the local demo
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <Link
              href="/demo"
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "h-12 rounded-full px-6 text-[0.95rem]",
              })}
            >
              See the approval gate
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm text-muted-foreground">
            {proofPoints.map((point) => (
              <span key={point} className="inline-flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                {point}
              </span>
            ))}
          </div>

          <Link
            href="https://github.com/cbetz/last-ehr"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconGitHub className="h-4 w-4" aria-hidden="true" />
            Inspect the source
          </Link>
        </div>

        <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
          <div
            aria-hidden="true"
            className="absolute -inset-5 -z-10 rounded-[2rem] bg-primary/10 blur-3xl"
          />
          <div className="overflow-hidden rounded-[1.4rem] border border-border/90 bg-card/90 p-2 shadow-[0_32px_90px_-38px_hsl(var(--foreground)/0.72)] backdrop-blur">
            <div className="flex items-center justify-between rounded-t-[1rem] border border-border/70 bg-background/85 px-4 py-3 text-[0.68rem] font-medium uppercase tracking-[0.13em] text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.14)]" />
                Approval activity
              </span>
              <span className="font-mono normal-case tracking-normal">synthetic / session-4a7</span>
            </div>
            <div className="relative overflow-hidden rounded-b-[1rem] border-x border-b border-border/70">
              <Image
                src={demoImage}
                alt="Last EHR shows an observation proposal for Maria Garcia, with a visible approval action before the FHIR write can save."
                priority
                placeholder="blur"
                sizes="(max-width: 1024px) 100vw, 54vw"
                className="h-auto w-full"
              />
            </div>
          </div>

          <div className="absolute -bottom-6 -left-4 hidden w-64 rounded-2xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur sm:block">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-primary">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Write boundary
            </div>
            <p className="mt-2 text-sm font-medium leading-5 text-foreground">
              Proposed FHIR resource is visible before execution.
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
              backend policy still applies
            </div>
          </div>

          <div className="absolute -right-3 top-[18%] hidden rounded-xl border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur xl:flex xl:items-center xl:gap-2">
            <Terminal className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span className="font-mono text-[0.7rem] text-muted-foreground">needsApproval: true</span>
          </div>
        </div>
      </div>
    </section>
  );
}
