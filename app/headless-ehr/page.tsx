import type { Metadata } from "next";
import Link from "next/link";
import {
  CableIcon,
  DatabaseIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";
import { Faq, type FaqItem } from "@/components/faq";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Headless EHR & EMR Platform",
  description:
    "Last EHR is a headless EHR / EMR platform — an API-first, FHIR-native clinical backend you build modern, AI-powered patient experiences on. Learn what a headless EHR is and how it compares to a traditional EHR.",
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
    title: "Headless EHR & EMR Platform | Last EHR",
    description:
      "An API-first, FHIR-native clinical backend you build modern, AI-powered patient experiences on.",
    url: "/headless-ehr",
  },
};

const benefits = [
  {
    icon: <DatabaseIcon aria-hidden="true" />,
    title: "FHIR-native & interoperable",
    description:
      "Patient data is stored as standard FHIR resources and exposed through APIs, so it moves cleanly between systems instead of getting locked in a vendor silo.",
  },
  {
    icon: <CableIcon aria-hidden="true" />,
    title: "Own your experience",
    description:
      "Build the exact UI and workflows your clinicians and patients need on top of a managed backend — no fighting a fixed, one-size-fits-all application.",
  },
  {
    icon: <SparklesIcon aria-hidden="true" />,
    title: "AI-ready by design",
    description:
      "Because the data is API-first and structured, you can connect AI agents that read and write the chart — summarizing notes, surfacing context, and automating busywork.",
  },
  {
    icon: <ShieldCheckIcon aria-hidden="true" />,
    title: "Compliance at the platform",
    description:
      "Audit logging, access controls, and HIPAA-oriented infrastructure live in the backend, so your application inherits the hard parts instead of rebuilding them.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "What is a headless EHR?",
    a: "A headless EHR is an electronic health record system where the clinical data layer — patient records, FHIR resources, authentication, and compliance — is decoupled from the user interface and exposed through APIs. Instead of a fixed, one-size-fits-all application, your team builds the exact frontend and workflows you need on top of a managed, standards-based backend.",
  },
  {
    q: "Is a headless EHR the same as a headless EMR?",
    a: "In practice, yes. The terms EHR (electronic health record) and EMR (electronic medical record) are often used interchangeably, so a 'headless EHR' and a 'headless EMR' describe the same idea: an API-first clinical backend you build your own experience on. Last EHR fits either label.",
  },
  {
    q: "What's the difference between an EHR and an EMR?",
    a: "An EMR is essentially the digital version of a single practice's paper chart, used internally. An EHR is broader — designed to share a patient's record across providers and organizations. For modern, interoperable systems the two terms are frequently used as synonyms.",
  },
  {
    q: "How is a headless EHR different from a traditional EHR?",
    a: "A traditional EHR ships a monolithic application with a fixed UI and workflows you have to adapt to. A headless EHR gives you the data, APIs, and compliance, and lets you own the interface — so you can build differentiated, modern experiences and add AI without waiting on a vendor's roadmap.",
  },
  {
    q: "Is a headless EHR HIPAA compliant?",
    a: "A good headless EHR handles the heavy compliance work — HIPAA-oriented infrastructure, audit logging, access controls, and data residency — at the platform layer, so your application inherits it. Overall compliance still depends on how you build and operate the experience you put on top.",
  },
  {
    q: "Can I add AI agents to a headless EHR?",
    a: "Yes. Because the data is API-first and FHIR-native, you can connect AI agents that read and write structured clinical data — searching for patients, drafting and summarizing notes, surfacing the right information, and automating routine workflows. That is the core of what Last EHR enables.",
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
              A{" "}
              <span className="bg-gradient-to-b from-primary/60 to-primary bg-clip-text text-transparent">
                headless EHR &amp; EMR
              </span>{" "}
              for modern clinical teams
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground">
              Last EHR is an API-first, FHIR-native clinical backend. Keep the
              hard parts — data, interoperability, and compliance — managed, and
              build the patient and provider experience you actually want on top.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/#signup" className={buttonVariants()}>
                Get early access
              </Link>
              <Link
                href="/demo"
                className={buttonVariants({ variant: "outline" })}
              >
                Try the live demo
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
                <strong className="text-foreground">headless EMR</strong> — the
                concept is identical. The point is the same either way: own your
                product experience, and let the platform handle the
                undifferentiated heavy lifting of storage, standards, and
                compliance.
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
                  compliance built in. You own the UI and ship differentiated,
                  AI-powered experiences on your own timeline.
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="container py-12">
            <h2 className="text-center text-3xl font-bold md:text-4xl">
              Why teams build on a headless EHR
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
              {benefits.map(({ icon, title, description }) => (
                <Card key={title} className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="grid place-items-center gap-4 text-center">
                      {icon}
                      {title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-center text-muted-foreground">
                    {description}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <Faq items={faqs} />

          <section className="container py-16 text-center sm:py-24">
            <h2 className="text-3xl font-bold md:text-4xl">
              Build on Last EHR
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-xl text-muted-foreground">
              Pick a headless EHR, connect your integrations, and add AI agents.
              Focus on your secret sauce and let us handle the rest.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/#signup" className={buttonVariants()}>
                Get early access
              </Link>
              <Link
                href="/demo"
                className={buttonVariants({ variant: "outline" })}
              >
                Try the live demo
              </Link>
            </div>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
