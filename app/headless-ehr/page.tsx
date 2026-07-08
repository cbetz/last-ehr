import type { Metadata } from "next";
import Link from "next/link";
import { BotIcon, CableIcon, DatabaseIcon, ShieldCheckIcon } from "lucide-react";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";
import { Faq, type FaqItem } from "@/components/faq";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconGitHub } from "@/components/ui/icons";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Headless EHR for Modern Clinical Teams",
  description:
    "Learn what a headless EHR is and how it compares to a traditional EHR. Last EHR is an open-source AI agent layer that runs on your FHIR backend (Medplum, or HAPI locally) and adds approval-gated AI to the chart.",
  keywords: [
    "headless EHR",
    "headless EMR",
    "EHR vs EMR",
    "FHIR EHR",
    "API-first EHR",
    "build on an EHR",
    "AI EHR",
  ],
  alternates: { canonical: "/headless-ehr" },
  openGraph: {
    type: "article",
    title: "Headless EHR for Modern Clinical Teams | Last EHR",
    description:
      "What a headless EHR is, how it compares to a traditional EHR, and how Last EHR adds approval-gated AI agents on top of your FHIR backend.",
    url: "https://www.lastehr.com/headless-ehr",
    images: ["https://www.lastehr.com/opengraph-image"],
  },
};

const benefits = [
  {
    icon: <DatabaseIcon className="h-5 w-5" aria-hidden="true" />,
    title: "FHIR-native and interoperable",
    description:
      "Patient data is stored as standard FHIR resources and exposed through APIs, so it moves cleanly between systems instead of getting locked in a vendor silo.",
  },
  {
    icon: <CableIcon className="h-5 w-5" aria-hidden="true" />,
    title: "Own your experience",
    description:
      "Build the exact UI and workflows your clinicians and patients need on top of a managed backend, instead of adapting to a fixed application.",
  },
  {
    icon: <BotIcon className="h-5 w-5" aria-hidden="true" />,
    title: "Add AI agents",
    description:
      "Because the data is API-first and structured, you can add AI agents that read the chart and, with approval, write to it. Last EHR is one such layer.",
  },
  {
    icon: <ShieldCheckIcon className="h-5 w-5" aria-hidden="true" />,
    title: "Compliance at the platform",
    description:
      "Audit logging, access controls, and HIPAA-oriented infrastructure live in the backend, so your application inherits the hard parts instead of rebuilding them.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "What is a headless EHR?",
    a: "A headless EHR is an electronic health record system where the clinical data layer (patient records, FHIR resources, authentication, and compliance) is decoupled from the user interface and exposed through APIs. Instead of a fixed application, your team builds the exact frontend and workflows you need on top of a managed, standards-based backend.",
  },
  {
    q: "Is a headless EHR the same as a headless EMR?",
    a: "In practice, yes. The terms EHR (electronic health record) and EMR (electronic medical record) are often used interchangeably, so a 'headless EHR' and a 'headless EMR' describe the same idea: an API-first clinical backend you build your own experience on. Last EHR is the AI agent layer you run on top of one.",
  },
  {
    q: "What's the difference between an EHR and an EMR?",
    a: "An EMR is essentially the digital version of a single practice's paper chart, used internally. An EHR is broader: designed to share a patient's record across providers and organizations. For modern, interoperable systems the two terms are frequently used as synonyms.",
  },
  {
    q: "How is a headless EHR different from a traditional EHR?",
    a: "A traditional EHR ships a monolithic application with a fixed UI and workflows you have to adapt to. A headless EHR gives you the data, APIs, and compliance, and lets you own the interface. You build the frontend your team needs and add AI without waiting on a vendor's roadmap.",
  },
  {
    q: "Is a headless EHR HIPAA compliant?",
    a: "A good headless EHR handles the heavy compliance work (HIPAA-oriented infrastructure, audit logging, access controls, and data residency) at the platform layer, so your application inherits it. Overall compliance still depends on how you build and operate the experience you put on top.",
  },
  {
    q: "Can I add AI agents to a headless EHR?",
    a: "Yes. Because the data is API-first and FHIR-native, you can connect AI agents that read and write structured clinical data. Last EHR is one such layer: it searches patients, opens a chart, and makes approval-gated writes (add a note, record an observation) scoped by your access controls.",
  },
  {
    q: "Are there open-source headless EHR options?",
    a: "Yes. Medplum is an open-source, FHIR-native headless backend with hosted and self-hosted options. HAPI FHIR is a long-standing open-source FHIR server you can build on. OpenEMR is open source but a full EMR rather than headless-first. Commercial options include Aidbox, Firely Server, Canvas Medical, and Oystehr. Last EHR is not a backend at all: it is an open-source AI agent layer that runs on top of one (Medplum, or HAPI for fully local self-hosting).",
  },
];

export default function HeadlessEhrPage() {
  return (
    <>
      <Navbar />
      <main>
        <article>
          <section className="container py-16 text-center sm:py-24">
            <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-tight md:text-6xl">
              A headless EHR for modern clinical teams
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground">
              A headless EHR keeps your clinical data as FHIR behind an API, so
              you own the interface. Last EHR is the open-source AI agent layer
              you run on top: it reads the chart and makes approval-gated writes,
              scoped by your access controls.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/demo" className={buttonVariants()}>
                Try the live demo
              </Link>
              <Link
                href="https://github.com/cbetz/last-ehr"
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                <IconGitHub className="mr-2 h-4 w-4" aria-hidden="true" />
                View on GitHub
              </Link>
            </div>
          </section>

          <section className="container max-w-3xl py-12">
            <h2 className="text-3xl font-bold md:text-4xl">
              What is a headless EHR?
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                A <strong className="text-foreground">headless EHR</strong> is an
                electronic health record system where the clinical data layer is
                separated from the user interface. The backend stores patient
                records as standard FHIR resources and exposes them through APIs,
                while you build the frontend, screens, and workflows yourself.
              </p>
              <p>
                Because EHR and EMR are commonly used interchangeably, you&apos;ll
                also see this called a{" "}
                <strong className="text-foreground">headless EMR</strong>. The
                concept is identical. The point is the same either way: own your
                product experience, and let the platform handle the storage,
                standards, and compliance.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-12">
            <h2 className="text-3xl font-bold md:text-4xl">
              Headless EHR vs. a traditional EHR
            </h2>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Traditional EHR</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  A monolithic application with a fixed interface and workflows.
                  You adapt your team to the vendor&apos;s product, and new
                  experiences wait on the vendor&apos;s roadmap.
                </CardContent>
              </Card>
              <Card className="border-primary/40">
                <CardHeader>
                  <CardTitle>Headless EHR</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  A managed, API-first backend with the data, standards, and
                  compliance built in. You own the UI and ship the experiences
                  your team needs on your own timeline.
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="container py-12">
            <h2 className="text-3xl font-bold md:text-4xl">
              Why teams build on a headless EHR
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {benefits.map(({ icon, title, description }) => (
                <Card key={title} className="border-border bg-transparent">
                  <CardHeader className="space-y-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground">
                      {icon}
                    </div>
                    <CardTitle className="text-base">{title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="container max-w-3xl py-12">
            <h2 className="text-3xl font-bold md:text-4xl">
              Headless EHR options: open source and commercial
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                The category is small but real, and the options differ more in
                philosophy than in feature lists. A non-exhaustive map:
              </p>
              <ul className="list-disc space-y-3 pl-6">
                <li>
                  <strong className="text-foreground">Medplum</strong>: an
                  open-source, FHIR-native headless backend with hosted and
                  self-hosted options; authentication, access policies,
                  subscriptions, and audit come built in. This is the backend
                  Last EHR runs on today.
                </li>
                <li>
                  <strong className="text-foreground">Aidbox</strong> (Health
                  Samurai): a commercial FHIR server platform aimed at teams
                  building products on FHIR.
                </li>
                <li>
                  <strong className="text-foreground">HAPI FHIR</strong>: the
                  long-standing open-source Java FHIR server. A bare FHIR API;
                  you assemble auth, tenancy, and tooling around it.
                </li>
                <li>
                  <strong className="text-foreground">Firely Server</strong>: a
                  commercial FHIR server from one of the major FHIR tooling
                  vendors.
                </li>
                <li>
                  <strong className="text-foreground">Canvas Medical</strong>:
                  a developer-first EMR with APIs; closer to a full EMR with a
                  programmable surface than a bare headless backend.
                </li>
                <li>
                  <strong className="text-foreground">Oystehr</strong>: an
                  API-first healthcare platform, known for the open-source
                  Ottehr telehealth project built on it.
                </li>
                <li>
                  <strong className="text-foreground">OpenEMR</strong>: a
                  mature open-source EMR. Not headless-first, but it has APIs
                  and a large installed base.
                </li>
              </ul>
              <p>
                Offerings change; verify current capabilities and terms
                directly with each project. Last EHR runs on Medplum or locally on HAPI FHIR,
                and the FHIR calls are the seam where other backends could
                slot in later.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-12">
            <h2 className="text-3xl font-bold md:text-4xl">
              Adding an AI agent to a headless EHR
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                A headless backend changes what an AI agent can be. Because
                the chart is already structured FHIR behind an API, an agent
                can read it as data rather than scraping a UI, and its writes
                can be bounded by the backend&apos;s own access control
                instead of trust.
              </p>
              <p>
                That is exactly what Last EHR does: a chat agent with four
                FHIR tools where every write stops at an approval card before
                it touches the chart. Read{" "}
                <Link
                  href="/approval-gated-writes"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  how approval-gated writes work
                </Link>
                , how the agent{" "}
                <Link
                  href="/chat-with-fhir-data"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  turns FHIR resources into chart context
                </Link>
                , or{" "}
                <Link
                  href="/medplum-ai-agent"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  how to add it to a Medplum project
                </Link>
                .
              </p>
            </div>
          </section>

          <Faq items={faqs} />

          <section className="container py-16 text-center sm:py-24">
            <h2 className="text-3xl font-bold md:text-4xl">Build on Last EHR</h2>
            <p className="mx-auto mt-4 max-w-2xl text-xl text-muted-foreground">
              Last EHR is open source and self-hosted. Run it on your Medplum,
              bring your own model key, and add an approval-gated AI agent to the
              chart.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/demo" className={buttonVariants()}>
                Try the live demo
              </Link>
              <Link
                href="https://github.com/cbetz/last-ehr"
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                <IconGitHub className="mr-2 h-4 w-4" aria-hidden="true" />
                View on GitHub
              </Link>
            </div>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
