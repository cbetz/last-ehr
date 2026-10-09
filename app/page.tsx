import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import AISection from "@/components/AI";
import Hero from "@/components/Hero";
import { CoverageSection } from "@/components/Coverage";
import { HowItWorks } from "@/components/HowItWorks";
import Navbar from "@/components/Navbar";
import { SignupForm } from "@/components/SignupForm";
import { SiteFooter } from "@/components/site-footer";
import { buttonVariants } from "@/components/ui/button";

const backends = [
  ["Medplum", "Authenticated web app, SMART launch, and MCP."],
  ["HAPI FHIR", "Local synthetic evaluation through the included Docker stack."],
  ["Aidbox, Firely, Oystehr", "Web adapters verified for synthetic evaluation."],
];

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <CoverageSection />
        <HowItWorks />
        <AISection />

        <section id="integrations" className="border-b marketing-rule bg-muted/20">
          <div className="container grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
            <div>
              <p className="section-kicker">Support today</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Start with synthetic data.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
                Last EHR is an alpha project. Medplum is the supported
                authenticated setup; the other adapters are for evaluation.
              </p>
              <Link href="/docs/support" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold hover:text-primary">
                Read the support matrix
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <div>
              <dl className="divide-y divide-border border-y border-border">
                {backends.map(([name, detail]) => (
                  <div key={name} className="grid gap-2 py-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-5">
                    <dt className="text-sm font-semibold">{name}</dt>
                    <dd className="text-sm leading-6 text-muted-foreground">{detail}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 text-sm leading-6 text-muted-foreground">
                The repo includes an{" "}
                <Link href="/docs/agent-write-protocol" className="underline underline-offset-4 hover:text-foreground">approval protocol draft</Link>
                {" "}and a{" "}
                <Link href="/docs/conformance" className="underline underline-offset-4 hover:text-foreground">conformance suite</Link>
                {" "}to test approval and persistence behavior. These checks
                do not establish clinical correctness or compliance.
              </p>
            </div>
          </div>
        </section>

        <section id="start" className="border-b marketing-rule">
          <div className="container grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
            <div>
              <p className="section-kicker">Apache-2.0</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Run it, inspect it, change it.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
                Self-host Last EHR with your own FHIR backend and model. The
                source, setup guides, tests, and known limitations are public.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="https://github.com/cbetz/last-ehr" target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "lg", className: "h-12 rounded-sm px-5" })}>
                  View on GitHub
                  <ArrowUpRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/docs/quickstart" className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 rounded-sm px-5" })}>
                  Read the quickstart
                </Link>
              </div>
            </div>
            <div className="border border-border bg-card p-5 sm:p-6">
              <h3 className="text-lg font-semibold">Interested in a hosted version?</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                There is no managed service yet. Leave your email for updates
                if that changes.
              </p>
              <div className="mt-5">
                <SignupForm submitLabel="Send me hosted-service updates" />
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
