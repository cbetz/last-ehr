import type { Metadata } from "next";
import Link from "next/link";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";
import { buttonVariants } from "@/components/ui/button";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Connect Last EHR to Medplum",
  description:
    "Run Last EHR with your Medplum project, launch it from a patient chart with SMART, or connect its chart tools to an MCP client.",
  path: "/medplum-ai-agent",
});

export default function MedplumAiAgentPage() {
  return (
    <>
      <Navbar />
      <main>
        <article className="container max-w-3xl py-16 sm:py-24">
          <header>
            <p className="section-kicker">Medplum integration</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              Connect Last EHR to your Medplum project
            </h1>
            <p className="mt-6 text-xl leading-8 text-muted-foreground">
              Search patients, read their charts, and propose notes, observations,
              and follow-up tasks. Medplum stores the records and enforces access;
              Last EHR supplies the chat interface and write approval cards.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/demo" className={buttonVariants()}>Try the synthetic demo</Link>
              <Link href="/docs/quickstart#medplum-backed-demo" className={buttonVariants({ variant: "outline" })}>Medplum quickstart</Link>
            </div>
          </header>

          <section className="mt-14 border-t border-border pt-8">
            <h2 className="text-2xl font-semibold tracking-tight">Run against your project</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              You need a Medplum project and a supported model credential.
              Start from the repository&apos;s environment example:
            </p>
            <pre className="mt-5 overflow-x-auto rounded-lg border bg-card p-4 text-sm leading-7">
              <code>{`git clone https://github.com/cbetz/last-ehr.git
cd last-ehr
npm install
cp .env.example .env.local`}</code>
            </pre>
            <p className="mt-4 leading-7 text-muted-foreground">
              Configure the Medplum client credentials, backend URL if
              self-hosted, and model provider in <code className="text-sm text-foreground">.env.local</code>.
              Follow the quickstart to seed a dedicated synthetic project and
              start the app. The agent&apos;s FHIR calls use the authenticated
              identity for the active session and remain subject to Medplum&apos;s AccessPolicy.
            </p>
            <p className="mt-4 leading-7 text-muted-foreground">
              Last EHR is alpha software. Use synthetic records for evaluation.
              Messages and chart context go to the configured model provider;
              review the <Link href="/docs/threat-model" className="text-foreground underline underline-offset-4">data boundary</Link> before connecting a project.
            </p>
          </section>

          <section className="mt-12 border-t border-border pt-8">
            <h2 className="text-2xl font-semibold tracking-tight">Launch from a Medplum patient chart</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Register a ClientApplication in your Medplum project with these
              values, replacing the example host with your deployment:
            </p>
            <pre className="mt-5 overflow-x-auto rounded-lg border bg-card p-4 text-sm leading-7">
              <code>{`launchUri:   https://your-deployment.example/launch
redirectUri: https://your-deployment.example/launch/callback`}</code>
            </pre>
            <p className="mt-4 leading-7 text-muted-foreground">
              Set <code className="text-sm text-foreground">SMART_CLIENT_ID</code> to that
              application&apos;s ID. Launching from the Medplum Apps tab opens Last
              EHR with the selected patient and reuses the Medplum sign-in. The
              resulting session follows the granted SMART scopes and backend
              permissions. Writes still require approval.
            </p>
            <Link href="/docs/quickstart#medplum-backed-demo" className="mt-5 inline-block font-medium underline underline-offset-4">Read the full Medplum quickstart</Link>
          </section>

          <section className="mt-12 border-t border-border pt-8">
            <h2 className="text-2xl font-semibold tracking-tight">Use chart tools in your own MCP client</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              For an existing agent client, use the standalone MCP package
              instead of the web interface:
            </p>
            <pre className="mt-5 overflow-x-auto rounded-lg border bg-card p-4 text-sm leading-7">
              <code>npx -y @lastehr/mcp init --client claude-code</code>
            </pre>
            <p className="mt-4 leading-7 text-muted-foreground">
              Configure a least-privilege Medplum identity using the MCP guide.
              The package offers patient search, chart sections, and document
              text through the same readers as the web agent. It is read-only
              by default; the optional write profile requires a compatible
              client and approval for each action.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/docs/mcp" className={buttonVariants({ variant: "outline" })}>Configure the MCP package</Link>
              <Link href="/docs/support" className={buttonVariants({ variant: "outline" })}>Check backend support</Link>
            </div>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
