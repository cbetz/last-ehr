import Link from "next/link";
import { ArrowRight, Check, GitBranch, Layers3, ShieldCheck, Terminal } from "lucide-react";

import AISection from "@/components/AI";
import Hero from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import Navbar from "@/components/Navbar";
import { SignupForm } from "@/components/SignupForm";
import { SiteFooter } from "@/components/site-footer";
import { buttonVariants } from "@/components/ui/button";

const localDemoFacts = [
  "Starts HAPI FHIR and Postgres with Docker",
  "Seeds a synthetic chart—no Medplum account needed",
  "Runs one fixed, approval-gated observation flow",
];

const builderPaths = [
  {
    icon: ShieldCheck,
    eyebrow: "Safety model",
    title: "Make intent reviewable",
    description:
      "See the exact resource proposal before a chart write can execute, and keep backend policy as the final authority.",
    href: "/approval-gated-writes",
    cta: "Read the model",
  },
  {
    icon: Layers3,
    eyebrow: "Integration",
    title: "Fit the FHIR layer you own",
    description:
      "Medplum is the authenticated path. HAPI is included for local evaluation. Other backends begin with a small contract.",
    href: "https://github.com/cbetz/last-ehr/blob/main/docs/adapters.md",
    cta: "Build an adapter",
  },
  {
    icon: GitBranch,
    eyebrow: "Open source",
    title: "Trace every boundary",
    description:
      "The prompt, tool definitions, adapter seam, local demo, and safety documentation live in the repository—not behind a platform.",
    href: "https://github.com/cbetz/last-ehr",
    cta: "Browse the repository",
  },
];

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <AISection />

        <section id="local" className="container py-20 sm:py-28">
          <div className="grid gap-10 rounded-[1.5rem] border border-border bg-card p-6 shadow-[0_28px_80px_-54px_hsl(var(--foreground)/0.9)] sm:p-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div className="max-w-md">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary">
                Evaluate locally
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                A first run without an account, API key, or fragile setup.
              </h2>
              <p className="mt-5 text-lg leading-8 text-muted-foreground">
                Use the deterministic local path to inspect the approval loop
                before connecting a model or a real backend. It is deliberately
                constrained to synthetic data and one fixed FHIR write.
              </p>
              <Link
                href="/docs#local"
                className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
              >
                Read the full quickstart
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <div>
              <div className="overflow-hidden rounded-2xl border border-border bg-[#071417] text-[#e9f7f2] shadow-inner">
                <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.035] px-5 py-3 font-mono text-[0.68rem] text-[#8da7a0]">
                  <span className="inline-flex items-center gap-2">
                    <Terminal className="h-3.5 w-3.5 text-[#9ef2d0]" aria-hidden="true" />
                    LOCAL / SYNTHETIC
                  </span>
                  <span>macOS · Linux · Docker</span>
                </div>
                <pre className="overflow-x-auto p-6 font-mono text-sm leading-7 sm:p-8 sm:text-[0.95rem]">
                  <code><span className="text-[#78958c]">$</span> npm install{`\n`}<span className="text-[#78958c]">$</span> npm run demo:local</code>
                </pre>
              </div>
              <ul className="mt-5 grid gap-3 sm:grid-cols-3">
                {localDemoFacts.map((fact) => (
                  <li key={fact} className="flex gap-2 text-sm leading-5 text-muted-foreground">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    {fact}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="builders" className="border-y border-border/70 bg-muted/20">
          <div className="container py-20 sm:py-28">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary">
                  For teams and contributors
                </p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                  A reference implementation with an opinionated point of view.
                </h2>
              </div>
              <p className="max-w-md text-base leading-7 text-muted-foreground">
                It is intentionally not another EHR, policy engine, or hosted
                black box. It is the smallest useful place to study and extend
                approval-gated FHIR agent behavior.
              </p>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {builderPaths.map(({ icon: Icon, eyebrow, title, description, href, cta }) => {
                const external = href.startsWith("http");
                return (
                  <article key={title} className="group rounded-[1.25rem] border border-border bg-background p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg sm:p-7">
                    <div className="flex items-start justify-between gap-6">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</span>
                    </div>
                    <h3 className="mt-9 text-xl font-semibold tracking-[-0.03em]">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
                    <Link
                      href={href}
                      target={external ? "_blank" : undefined}
                      rel={external ? "noopener noreferrer" : undefined}
                      className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors group-hover:text-primary"
                    >
                      {cta}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="documentation" className="container py-20 sm:py-28">
          <div className="overflow-hidden rounded-[1.5rem] border border-border bg-[linear-gradient(125deg,hsl(var(--card))_0%,hsl(var(--muted)/0.6)_100%)] p-6 sm:p-10 lg:grid lg:grid-cols-[1fr_0.92fr] lg:gap-16">
            <div className="max-w-xl">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary">
                Documentation with a point of view
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                The context to make a responsible technical decision.
              </h2>
              <p className="mt-5 text-lg leading-8 text-muted-foreground">
                Start with a local evaluation, see the support boundary, trace
                the write path, and only then decide how to bring Last EHR into
                your architecture.
              </p>
              <Link
                href="/docs"
                className={buttonVariants({ size: "lg", className: "mt-8 h-12 rounded-full px-6" })}
              >
                Open the docs hub
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-10 grid gap-3 lg:mt-0">
              {[
                ["01", "Quickstart", "Run the deterministic local demo in one command."],
                ["02", "Support status", "Know exactly what is supported, local-only, or unverified."],
                ["03", "Approval gates", "Understand what the human review boundary does—and does not—protect."],
                ["04", "Backend adapters", "Use an executable starter and contract tests for the next FHIR backend."],
              ].map(([number, title, description]) => (
                <Link
                  key={title}
                  href="/docs"
                  className="group flex items-center gap-4 rounded-xl border border-border bg-background/75 p-4 transition-colors hover:border-primary/40 hover:bg-background"
                >
                  <span className="font-mono text-xs text-primary">{number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="signup" className="border-t border-border/70 bg-muted/20">
          <div className="container grid gap-10 py-20 sm:py-24 lg:grid-cols-[1fr_0.75fr] lg:items-start">
            <div className="max-w-xl">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary">
                Built in the open
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Start with something you can inspect.
              </h2>
              <p className="mt-5 text-lg leading-8 text-muted-foreground">
                Last EHR is Apache-2.0 and self-hostable. The future managed
                service is optional; the local stack, safety model, and source
                code are the product today.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/docs#local" className={buttonVariants({ size: "lg", className: "rounded-full px-6" })}>
                  Run it locally
                </Link>
                <Link
                  href="https://github.com/cbetz/last-ehr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline", size: "lg", className: "rounded-full px-6" })}
                >
                  View on GitHub
                </Link>
              </div>
              <p className="mt-7 text-sm leading-6 text-muted-foreground">
                Not a medical device or a substitute for clinical judgment,
                backend authorization, privacy review, or a HIPAA-ready
                deployment plan.
              </p>
            </div>
            <div className="rounded-[1.25rem] border border-border bg-background p-6 sm:p-7">
              <p className="text-sm font-semibold">Hosted updates, if you want them</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Join only for future managed-service news. Open-source updates
                ship in the repository.
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
