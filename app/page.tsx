import Link from "next/link";

import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import AISection from "@/components/AI";
import { SignupForm } from "@/components/SignupForm";
import { SiteFooter } from "@/components/site-footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <AISection />

        <section id="builders" className="container py-24 sm:py-32">
          <h2 className="text-3xl font-bold md:text-4xl">
            Built for people who need to inspect the boundary
          </h2>
          <p className="mt-4 max-w-3xl text-xl text-muted-foreground">
            The demo is the front door, but the repo is the product: run the
            tools locally, read the approval contract, and add another backend
            without touching the agent loop.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-lg border bg-transparent p-6">
              <h3 className="text-lg font-semibold">Run it locally</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Use Medplum, or run HAPI FHIR and Postgres with Docker for a
                local synthetic demo.
              </p>
              <Link
                href="/docs"
                className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
              >
                Open quickstart
              </Link>
            </div>
            <div className="rounded-lg border bg-transparent p-6">
              <h3 className="text-lg font-semibold">Port the backend</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The FHIR adapter surface is four methods. Aidbox, Oystehr, and
                Firely are natural next targets.
              </p>
              <Link
                href="https://github.com/cbetz/last-ehr/blob/main/docs/adapters.md"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
              >
                Read adapter guide
              </Link>
            </div>
            <div className="rounded-lg border bg-transparent p-6">
              <h3 className="text-lg font-semibold">Inspect the gate</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Write tools propose FHIR resources and pause before execution.
                Approval is explicit, and backend policy still applies.
              </p>
              <Link
                href="/approval-gated-writes"
                className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
              >
                See how it works
              </Link>
            </div>
          </div>
        </section>

        <section id="overview" className="container py-24 sm:py-32">
          <h2 className="text-3xl font-bold md:text-4xl">
            A thin, inspectable safety layer over your FHIR backend
          </h2>
          <div className="mt-4 max-w-3xl space-y-4 text-lg leading-relaxed text-muted-foreground">
            <p>
              Last EHR runs on top of your Medplum project and adds one thing:
              a chat agent with four FHIR tools. It searches patients, opens a
              chart (conditions, allergies, medications, observations,
              immunizations, notes), adds a free-text note, and records an
              observation. The two write tools are approval-gated: the agent
              proposes, an approval card shows exactly what will be saved, and
              nothing reaches the chart until you click Approve. Every call
              runs as the signed-in user, bounded by your Medplum AccessPolicy,
              and the layer stores no patient data of its own. The same four
              tools also run as an MCP server, read-only by default, for
              Claude Desktop, Claude Code, or any MCP client.
            </p>
            <p>
              Read how{" "}
              <Link
                href="/approval-gated-writes"
                className="font-medium text-foreground underline underline-offset-4"
              >
                approval-gated writes
              </Link>{" "}
              work, how the agent{" "}
              <Link
                href="/chat-with-fhir-data"
                className="font-medium text-foreground underline underline-offset-4"
              >
                turns FHIR resources into chart context
              </Link>
              , and how to{" "}
              <Link
                href="/medplum-ai-agent"
                className="font-medium text-foreground underline underline-offset-4"
              >
                add the agent to your Medplum project
              </Link>
              . New to the architecture? Start with{" "}
              <Link
                href="/headless-ehr"
                className="font-medium text-foreground underline underline-offset-4"
              >
                what a headless EHR is
              </Link>
              .
            </p>
            <p>
              Start with the <Link href="/docs" className="font-medium text-foreground underline underline-offset-4">local synthetic path</Link>{" "}
              or review the <Link href="https://github.com/cbetz/last-ehr/blob/main/docs/support.md" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-4">support status</Link>{" "}
              before pointing the reference app at another backend.
            </p>
          </div>
        </section>

        <section id="signup" className="container py-24 sm:py-32">
          <div className="mx-auto w-full max-w-[600px] space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-3xl md:text-4xl font-bold">
                Self-host the reference implementation
              </h2>
              <p className="text-muted-foreground text-xl">
                Last EHR is free and open source under Apache-2.0. The code,
                local stack, and adapter seam are the product today. A managed
                tier with hosted Medplum and a signed BAA is a separate,
                optional future path.
              </p>
            </div>

            <div className="rounded-lg border bg-muted/40 p-6">
              <h3 className="text-lg font-semibold">Hosted updates (optional)</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Join the waitlist only if you want news about the future
                managed offering.
              </p>
              <div className="mt-4">
                <SignupForm />
              </div>
            </div>

            <p className="px-2 text-center text-sm leading-normal text-muted-foreground">
              The code is open source.{" "}
              <Link
                href="https://github.com/cbetz/last-ehr"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline"
              >
                Get it on GitHub
              </Link>
              .
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
