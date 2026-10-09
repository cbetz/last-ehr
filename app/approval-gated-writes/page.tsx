import type { Metadata } from "next";
import Link from "next/link";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";
import { buttonVariants } from "@/components/ui/button";
import { PROPOSAL_TOOLS } from "@/lib/tool-catalog";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Human Approval for FHIR Agent Writes",
  description:
    "How Last EHR previews notes, observations, corrections, and tasks before saving them. Covers cancellation, backend permissions, and MCP approval.",
  path: "/approval-gated-writes",
});

export default function ApprovalGatedWritesPage() {
  return (
    <>
      <Navbar />
      <main>
        <article className="container max-w-3xl py-16 sm:py-24">
          <header>
            <p className="section-kicker">Chart writes</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              Review a proposed change before it saves
            </h1>
            <p className="mt-6 text-xl leading-8 text-muted-foreground">
              Last EHR pauses each write tool for a human decision. The approval
              card shows what the agent proposes; Approve sends that change to
              the FHIR backend, and Cancel saves nothing.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/demo" className={buttonVariants()}>Try the synthetic demo</Link>
              <Link href="/docs/approval-gates" className={buttonVariants({ variant: "outline" })}>Read the implementation</Link>
            </div>
          </header>

          <section className="mt-14 border-t border-border pt-8">
            <h2 className="text-2xl font-semibold tracking-tight">What the agent can propose</h2>
            <dl className="mt-5 divide-y divide-border">
              {PROPOSAL_TOOLS.map(({ name, detail }) => (
                <div key={name} className="py-4">
                  <dt className="font-mono text-sm font-medium">{name}</dt>
                  <dd className="mt-2 leading-7 text-muted-foreground">{detail}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 leading-7 text-muted-foreground">
              These tools create Communication, Observation, or Task resources.
              They do not update or delete existing records. A correction creates
              a linked, superseding Observation; the earlier entry stays on the chart.
            </p>
          </section>

          <section className="mt-12 border-t border-border pt-8">
            <h2 className="text-2xl font-semibold tracking-tight">What happens when you approve</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Ask “Record a heart rate of 72 bpm for Maria Garcia.” The agent
              first finds the patient, then prepares a measurement proposal.
              Review the patient, label, value, and unit on the card. Only an
              explicit approval runs the write.
            </p>
            <p className="mt-4 leading-7 text-muted-foreground">
              The backend still checks the caller&apos;s permissions. On the
              authenticated Medplum path, an AccessPolicy can reject a write
              even after you approve it. Agent-created resources carry an
              AI-assistance label; deployments can also record Provenance.
            </p>
            <p className="mt-4 leading-7 text-muted-foreground">
              Approval confirms your decision to save the proposal. It does not
              establish that the content is clinically correct. Chart reads also
              run without this checkpoint and, in external model modes, send
              context to the configured provider. Use synthetic data while
              evaluating this alpha software.
            </p>
          </section>

          <section className="mt-12 border-t border-border pt-8">
            <h2 className="text-2xl font-semibold tracking-tight">Use the same pattern in an MCP client</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              The MCP package exposes chart reads by default. Enable its write
              profile explicitly with <code className="text-sm text-foreground">LASTEHR_MCP_WRITES=proposal</code>.
              Write tools are then available only to a client that supports the
              approval prompt. Each proposed action waits for a human decision.
            </p>
            <p className="mt-4 leading-7 text-muted-foreground">
              The draft write protocol documents the proposal, decision, commit,
              and audit steps. Its conformance suite tests approval, denial,
              cancellation, and failure paths against a synthetic FHIR store.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/docs/mcp" className={buttonVariants({ variant: "outline" })}>Configure MCP writes</Link>
              <Link href="/docs/agent-write-protocol" className={buttonVariants({ variant: "outline" })}>Read the draft protocol</Link>
              <Link href="/docs/conformance" className={buttonVariants({ variant: "outline" })}>Run conformance checks</Link>
            </div>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
