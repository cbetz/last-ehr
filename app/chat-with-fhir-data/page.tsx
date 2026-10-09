import type { Metadata } from "next";
import Link from "next/link";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";
import { buttonVariants } from "@/components/ui/button";
import { READ_TOOLS } from "@/lib/tool-catalog";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Chat with FHIR Data: How Chart Reads Work",
  description:
    "The tools Last EHR uses to find patients, read chart sections and documents, and report incomplete results. Includes the model-provider data flow.",
  path: "/chat-with-fhir-data",
});

export default function ChatWithFhirDataPage() {
  return (
    <>
      <Navbar />
      <main>
        <article className="container max-w-3xl py-16 sm:py-24">
          <header>
            <p className="section-kicker">Chart reads</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              How the agent reads a FHIR chart
            </h1>
            <p className="mt-6 text-xl leading-8 text-muted-foreground">
              A chat request becomes a tool call. The tool fetches FHIR resources
              from your backend and returns chart context for the model to use
              in its answer.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/demo" className={buttonVariants()}>Try the synthetic demo</Link>
              <Link href="/docs/fhir-coverage" className={buttonVariants({ variant: "outline" })}>See chart coverage</Link>
            </div>
          </header>

          <section className="mt-14 border-t border-border pt-8">
            <h2 className="text-2xl font-semibold tracking-tight">From patient search to a focused read</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Start with “Find Maria Garcia,” then open the matching chart.
              Follow up with a question about a specific section or document.
              The model selects from these tools; it does not construct an
              arbitrary FHIR query.
            </p>
            <dl className="mt-5 divide-y divide-border">
              {READ_TOOLS.map(({ name, detail }) => (
                <div key={name} className="py-4">
                  <dt className="font-mono text-sm font-medium">{name}</dt>
                  <dd className="mt-2 leading-7 text-muted-foreground">{detail}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-12 border-t border-border pt-8">
            <h2 className="text-2xl font-semibold tracking-tight">A read result has limits</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              The reader reports capped result windows, unsupported filters,
              failed reference lookups, and documents it cannot decode. Those
              details matter when interpreting an answer.
            </p>
            <p className="mt-4 leading-7 text-muted-foreground">
              For example, a vaccine-code search can return no matches even
              when the chart has a vaccine recorded as free text. The tool
              reports that distinction so the agent can read the section
              without the code filter. A partial or unmatched search is not
              evidence that the patient never received the vaccine.
            </p>
            <p className="mt-4 leading-7 text-muted-foreground">
              Document reading currently supports inline text. A scanned PDF
              or an attachment URL is reported as unread. The model can still
              misinterpret the returned context; check the underlying records
              when accuracy matters.
            </p>
          </section>

          <section className="mt-12 border-t border-border pt-8">
            <h2 className="text-2xl font-semibold tracking-tight">Where chart context goes</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              In external model modes, your messages and the records the agent
              reads are sent to your configured provider. Reads do not pause
              for approval. The write approval card controls saving a change,
              not sending read context to the model.
            </p>
            <p className="mt-4 leading-7 text-muted-foreground">
              Last EHR stores no chart database or chat transcripts of its own.
              It is alpha software, and the public demo uses synthetic patients.
              The zero-key local walkthrough makes no model request, but follows
              a fixed sequence rather than answering arbitrary questions.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/docs/threat-model" className={buttonVariants({ variant: "outline" })}>Review the data boundary</Link>
              <Link href="/docs/quickstart" className={buttonVariants({ variant: "outline" })}>Run locally</Link>
            </div>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
