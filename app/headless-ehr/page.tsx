import type { Metadata } from "next";
import Link from "next/link";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";
import { buttonVariants } from "@/components/ui/button";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Headless EHR: The Backend and the Application",
  description:
    "How a FHIR backend and a clinical application fit together, and where Last EHR adds chart-reading tools and human-reviewed writes.",
  path: "/headless-ehr",
});

const responsibilities = [
  ["Patient records", "Your FHIR backend stores and serves the resources."],
  ["Identity and permissions", "Your backend authenticates users and determines their access."],
  ["Interface and workflow", "Your application decides how people find, read, and work with those records."],
];

export default function HeadlessEhrPage() {
  return (
    <>
      <Navbar />
      <main>
        <article className="container max-w-3xl py-16 sm:py-24">
          <header>
            <p className="section-kicker">Architecture</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              What a headless EHR gives you
            </h1>
            <p className="mt-6 text-xl leading-8 text-muted-foreground">
              A headless EHR exposes clinical records through APIs so you can
              build the interface and workflows. Last EHR connects an AI chat
              interface to a FHIR backend you operate.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/demo" className={buttonVariants()}>Try the synthetic demo</Link>
              <Link href="/docs/architecture" className={buttonVariants({ variant: "outline" })}>Read the architecture</Link>
            </div>
          </header>

          <section className="mt-14 border-t border-border pt-8">
            <h2 className="text-2xl font-semibold tracking-tight">The backend and application have different jobs</h2>
            <dl className="mt-5 divide-y divide-border">
              {responsibilities.map(([title, detail]) => (
                <div key={title} className="grid gap-2 py-4 sm:grid-cols-[12rem_1fr] sm:gap-5">
                  <dt className="font-medium">{title}</dt>
                  <dd className="leading-7 text-muted-foreground">{detail}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 leading-7 text-muted-foreground">
              FHIR defines a resource and API format. The backend you choose
              determines its authentication, tenancy, auditing, and deployment
              requirements. An API does not supply a complete clinical workflow.
            </p>
          </section>

          <section className="mt-12 border-t border-border pt-8">
            <h2 className="text-2xl font-semibold tracking-tight">Where Last EHR fits</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              The agent searches patients, reads chart sections, and proposes
              notes, observations, and follow-up tasks. A person reviews each
              proposed write before it is sent to the backend. The records stay
              in that backend; Last EHR does not maintain a separate chart database.
            </p>
            <p className="mt-4 leading-7 text-muted-foreground">
              For example, “Record a heart rate of 72 bpm for Maria Garcia”
              produces an Observation proposal. The reviewer sees the patient,
              measurement, and unit before choosing Approve or Cancel.
            </p>
            <Link href="/approval-gated-writes" className="mt-5 inline-block font-medium underline underline-offset-4">
              How proposed writes work
            </Link>
          </section>

          <section className="mt-12 border-t border-border pt-8">
            <h2 className="text-2xl font-semibold tracking-tight">Choose a starting point</h2>
            <ul className="mt-4 list-disc space-y-3 pl-5 leading-7 text-muted-foreground">
              <li><strong className="text-foreground">Medplum:</strong> the supported authenticated path, including backend permissions and SMART launch.</li>
              <li><strong className="text-foreground">Local HAPI FHIR:</strong> a synthetic evaluation stack with a fixed walkthrough that needs no model key.</li>
              <li><strong className="text-foreground">Other adapters:</strong> Aidbox, Firely Server, and Oystehr have documented synthetic evaluation paths.</li>
            </ul>
            <p className="mt-5 leading-7 text-muted-foreground">
              Last EHR is alpha software. Start with synthetic data. External
              model modes send chart context to the configured provider; review
              the <Link href="/docs/threat-model" className="text-foreground underline underline-offset-4">data boundary</Link> and
              the <Link href="/docs/support" className="text-foreground underline underline-offset-4">support matrix</Link> before choosing a deployment.
            </p>
            <Link href="/docs/quickstart" className={buttonVariants({ className: "mt-6" })}>Run the quickstart</Link>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
