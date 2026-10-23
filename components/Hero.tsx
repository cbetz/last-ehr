import Link from "next/link";
import { ArrowRight, CircleDotDashed } from "lucide-react";

import { buttonVariants } from "./ui/button";

export default function Hero() {
  const video = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: "Approve one FHIR write. Cancel the next.",
    description: "A 90-second edited screen walkthrough of Last EHR's fixed synthetic local demo. Independent paginated FHIR reads verify one approved Observation and no additional Observation after cancellation. No external model is called.",
    thumbnailUrl: "https://www.lastehr.com/demo/approve-and-decline.jpg",
    contentUrl: "https://www.lastehr.com/demo/approve-and-decline.mp4",
    uploadDate: "2026-10-23T00:00:00-04:00",
    duration: "PT90S",
    inLanguage: "en",
  };

  return (
    <section className="relative overflow-hidden border-b marketing-rule">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(video).replace(/</g, "\\u003c") }} />
      <div
        aria-hidden="true"
        className="marketing-grid pointer-events-none absolute inset-x-0 top-0 h-[29rem] opacity-45 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div className="container relative grid gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16">
        <div>
          <p className="section-kicker inline-flex items-center gap-2">
            <CircleDotDashed className="h-3.5 w-3.5" aria-hidden="true" />
            Open source · Alpha
          </p>
          <h1 className="mt-5 text-[clamp(2.7rem,5vw,4.6rem)] font-semibold leading-[1.02] tracking-[-0.065em] text-balance">
            AI tools for <span className="text-primary">FHIR patient charts.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9">
            Search patients, read their charts, and draft notes, observations,
            and follow-up tasks. Review each proposed change before it is saved
            to your FHIR backend.
          </p>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            Use the web app or connect your own agent through MCP.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/demo"
              className={buttonVariants({ size: "lg", className: "h-12 rounded-sm px-5" })}
            >
              Try the demo
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/docs/quickstart"
              className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 rounded-sm px-5" })}
            >
              Run locally
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            The demo uses synthetic patients. No sign-up required.
          </p>
        </div>

        <figure id="walkthrough" className="min-w-0 scroll-mt-24 border border-border bg-card">
          <figcaption className="border-b border-border px-5 py-4 font-mono text-xs text-muted-foreground">
            90 seconds · Synthetic local walkthrough
          </figcaption>
          <video
            className="aspect-video w-full bg-black"
            controls
            playsInline
            preload="none"
            poster="/demo/approve-and-decline.jpg"
            width={1920}
            height={1080}
            aria-label="Approve one FHIR write and cancel the next, with independent backend checks"
            aria-describedby="walkthrough-description"
          >
            <source src="/demo/approve-and-decline.mp4" type="video/mp4" />
            <track kind="captions" src="/demo/approve-and-decline.vtt" srcLang="en" label="English" />
            <a href="/demo/approve-and-decline.mp4">Download the walkthrough</a>
          </video>
          <div className="p-5 sm:p-7">
            <p className="text-xl font-medium leading-8 tracking-tight">
              Approve one write. Cancel the next.
            </p>
            <p id="walkthrough-description" className="mt-3 text-sm leading-6 text-muted-foreground">
              Watch the approval card and independent FHIR reads. This edited
              screen walkthrough uses a fixed request and synthetic records;
              no external model is called.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm underline underline-offset-4">
              <a href="/demo/approve-and-decline.mp4">Watch full size</a>
              <Link href="/docs/quickstart#recorded-approval-and-cancellation">Transcript and reproduce</Link>
              <a href="/demo/approve-and-decline.proof.json">FHIR proof (JSON)</a>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}
