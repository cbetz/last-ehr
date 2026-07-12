import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ClipboardCheck,
  FileCheck2,
  MonitorPlay,
  Terminal,
} from "lucide-react";

import AISection from "@/components/AI";
import Hero from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import Navbar from "@/components/Navbar";
import { SignupForm } from "@/components/SignupForm";
import { SiteFooter } from "@/components/site-footer";
import { buttonVariants } from "@/components/ui/button";

const entryPoints = [
  {
    number: "01",
    title: "See the decision point",
    description:
      "Use the live synthetic demo to watch a clinical write become a visible proposal before it is saved.",
    command: "Open /demo",
    href: "/demo",
    icon: MonitorPlay,
    cta: "Open the demo",
  },
  {
    number: "02",
    title: "Inspect MCP locally",
    description:
      "Start loopback HAPI, reset four fixture charts, and connect Claude Code or Cursor to two read-only tools.",
    command: "npm run mcp:demo",
    href: "/docs/mcp#zero-credential-local-lab-checkout-only",
    icon: Terminal,
    cta: "Run the Local Lab",
  },
  {
    number: "03",
    title: "Run the Safety Eval",
    description:
      "Create a scrubbed report for proposal, approval, denial, chart association, and cleanup on a disposable target.",
    command: "npm run eval",
    href: "/docs/evals",
    icon: ClipboardCheck,
    cta: "Read the evaluator",
  },
];

const evidenceRows = [
  ["Web agent", "Two write tools are proposal-shaped and approval-gated."],
  ["MCP Local Lab", "A real stdio handshake reads only fixture-restricted HAPI charts."],
  ["Adapter seam", "A reusable FHIR REST baseline and contract harness make the next backend testable."],
  ["Safety Eval", "A disposable synthetic workflow report proves approval, denial, chart association, and cleanup mechanics."],
];

const docRoutes = [
  ["01", "Evaluate", "Synthetic web demo and MCP Local Lab", "/docs/quickstart"],
  ["02", "Understand", "Approval gates, threat model, support boundary", "/docs/approval-gates"],
  ["03", "Integrate", "Medplum, MCP, and backend adapter paths", "/docs/mcp"],
  ["04", "Contribute", "Executable starter, contracts, and open roadmap", "/docs/adapters"],
];

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <AISection />

        <section id="start" className="border-b marketing-rule">
          <div className="container py-20 sm:py-28">
            <div className="grid gap-8 border-b border-border pb-9 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
              <div>
                <p className="section-kicker">Three useful first moves</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.052em] sm:text-5xl sm:leading-[1.02]">
                  Start with evidence, not a sales call.
                </h2>
              </div>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                The project is built for people who need to inspect the safety
                boundary before they bring an agent anywhere near a real chart.
                Pick the path that matches the question you have today.
              </p>
            </div>

            <div className="grid divide-y divide-border border-b border-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              {entryPoints.map(({ number, title, description, command, href, icon: Icon, cta }) => (
                <article key={number} className="flex min-h-80 flex-col py-7 lg:px-7 lg:py-9 first:lg:pl-0 last:lg:pr-0">
                  <div className="flex items-start justify-between gap-4">
                    <span className="font-mono text-sm text-primary">{number}</span>
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="mt-12 text-xl font-semibold tracking-[-0.03em]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
                  <code className="mt-6 w-fit border border-border bg-muted/35 px-2.5 py-1.5 font-mono text-[0.68rem] text-foreground">
                    {command}
                  </code>
                  <Link
                    href={href}
                    className="mt-auto pt-8 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
                  >
                    {cta}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="integrations" className="border-b marketing-rule bg-muted/20">
          <div className="container grid gap-12 py-20 sm:py-28 lg:grid-cols-[0.87fr_1.13fr] lg:gap-16">
            <div className="max-w-xl">
              <p className="section-kicker">An integration should be able to explain itself</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.052em] sm:text-5xl sm:leading-[1.02]">
                Make compatibility a testable claim.
              </h2>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                Last EHR keeps the extension point small: a FHIR backend
                contract, an executable adapter starter, and real HAPI
                integration coverage. The Safety Eval runs on those same
                disposable synthetic workflows and writes a scrubbed report, not
                a broad marketing badge.
              </p>
              <Link
                href="/docs/adapters"
                className={buttonVariants({ variant: "outline", size: "lg", className: "mt-8 h-12 rounded-sm px-5" })}
              >
                Read the adapter contract
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-4 py-3 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <FileCheck2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Proof surface
                </span>
                <span>synthetic / CI-backed</span>
              </div>
              <dl className="divide-y divide-border">
                {evidenceRows.map(([label, detail], index) => (
                  <div key={label} className="grid gap-3 px-4 py-5 sm:grid-cols-[8.5rem_1fr_auto] sm:items-start sm:px-5">
                    <dt className="font-mono text-xs text-primary">{String(index + 1).padStart(2, "0")}</dt>
                    <dd>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="mt-1 block text-sm leading-6 text-muted-foreground">{detail}</span>
                    </dd>
                    <span className="inline-flex w-fit items-center gap-1.5 border border-primary/25 px-2 py-1 font-mono text-[0.61rem] uppercase tracking-[0.1em] text-primary">
                      <Check className="h-3 w-3" aria-hidden="true" />
                      verified
                    </span>
                  </div>
                ))}
              </dl>
              <div className="border-t border-border bg-muted/35 px-5 py-4 text-xs leading-5 text-muted-foreground">
                The evaluator proves deterministic workflow mechanics, not
                clinical correctness, HIPAA compliance, or backend RBAC.
              </div>
            </div>
          </div>
        </section>

        <section id="documentation" className="border-b marketing-rule">
          <div className="container py-20 sm:py-28">
            <div className="grid gap-8 border-b border-border pb-9 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
              <div>
                <p className="section-kicker">Documentation as an operating manual</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.052em] sm:text-5xl sm:leading-[1.02]">
                  Make a responsible technical decision faster.
                </h2>
              </div>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Each guide names the path, the support boundary, and what still
                needs proof. The docs are a product surface, not a dump of API
                notes after the fact.
              </p>
            </div>

            <div className="divide-y divide-border border-b border-border">
              {docRoutes.map(([number, title, description, href]) => (
                <Link
                  key={number}
                  href={href}
                  className="group grid gap-3 py-5 transition-colors hover:text-primary sm:grid-cols-[4rem_13rem_1fr_auto] sm:items-center sm:gap-5 sm:py-6"
                >
                  <span className="font-mono text-sm text-primary">{number}</span>
                  <span className="text-lg font-semibold tracking-[-0.025em] text-foreground">{title}</span>
                  <span className="text-sm leading-6 text-muted-foreground">{description}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </Link>
              ))}
            </div>
            <Link
              href="/docs"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
            >
              Open the docs hub
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section id="signup" className="border-b marketing-rule bg-muted/20">
          <div className="container grid gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_0.82fr] lg:items-start">
            <div className="max-w-xl">
              <p className="section-kicker">Built in the open</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.052em] sm:text-4xl">
                Inspect the source before you trust the promise.
              </h2>
              <p className="mt-5 text-lg leading-8 text-muted-foreground">
                Last EHR is Apache-2.0. The code, safety notes, local paths,
                and support boundaries are public. A future managed offering is
                optional; the inspectable core is the point.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="https://github.com/cbetz/last-ehr" target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "lg", className: "h-12 rounded-sm px-5" })}>
                  View on GitHub
                  <ArrowUpRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/roadmap" className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 rounded-sm px-5" })}>
                  Read the roadmap
                </Link>
              </div>
              <p className="mt-7 text-sm leading-6 text-muted-foreground">
                Not a medical device, a substitute for clinical judgment, an
                authorization layer, or a HIPAA-ready deployment by default.
              </p>
            </div>
            <div className="border border-border bg-background p-5 sm:p-6">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.13em] text-primary">Hosted updates</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Join only for future managed-service news. Open-source updates
                ship in the repository first.
              </p>
              <div className="mt-5">
                <SignupForm />
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
