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

        <section id="overview" className="container py-24 sm:py-32">
          <h2 className="text-3xl font-bold md:text-4xl">
            A thin agent layer over your FHIR backend
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
          </div>
        </section>

        <section id="signup" className="container py-24 sm:py-32">
          <div className="mx-auto w-full max-w-[600px] space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-3xl md:text-4xl font-bold">
                Self-host it, or join the hosted waitlist
              </h2>
              <p className="text-muted-foreground text-xl">
                Last EHR is free and open source under Apache-2.0. A managed tier
                with hosted Medplum and a signed BAA is in development. Leave your
                email to join the waitlist.
              </p>
            </div>

            <SignupForm />

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
