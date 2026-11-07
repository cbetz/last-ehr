import Link from "next/link";
import { ArrowRight, CircleDotDashed, Star } from "lucide-react";

import { githubStarCount } from "@/lib/github-stars";

import { buttonVariants } from "./ui/button";

const GITHUB_REPO = "https://github.com/cbetz/last-ehr";

const walkthroughDescription =
  "A 90-second edited recording of the fixed local synthetic walkthrough. Approve one proposed Observation, decline the next, and compare separate FHIR reads: one resource added after approval, and no further change after cancellation. No external model is called. Patient data is invented.";

export default async function Hero() {
  const stars = await githubStarCount();
  const video = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: "Approve one write. Decline the next.",
    description: walkthroughDescription,
    thumbnailUrl: "https://www.lastehr.com/demo/approve-and-decline.jpg",
    contentUrl: "https://www.lastehr.com/demo/approve-and-decline.mp4",
    uploadDate: "2026-11-06",
    duration: "PT1M30S",
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
            Last provides the chart tools and review workflow. Connect an
            assistant such as Grok Bot through MCP, or use the web app.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/demo"
              className={buttonVariants({ size: "lg", className: "h-12 rounded-sm px-5" })}
            >
              Try the demo
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={stars === null ? "Star on GitHub" : `Star on GitHub, ${stars} stars`}
              className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 rounded-sm px-5" })}
            >
              <Star className="mr-2 h-4 w-4" aria-hidden="true" />
              Star on GitHub
              {stars === null ? null : (
                <span className="ml-2 border-l border-current/30 pl-2 font-mono tabular-nums">
                  {stars.toLocaleString("en-US")}
                </span>
              )}
            </Link>
            <Link
              href="/docs/grok-bot"
              className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 rounded-sm px-5" })}
            >
              Set up Grok Bot
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Browser demo: synthetic patients, no sign-up. Grok setup requires
            your own deployment or operator-approved pilot access.
          </p>
        </div>

        <figure id="walkthrough" className="min-w-0 scroll-mt-24 border border-border bg-card">
          <figcaption className="border-b border-border px-5 py-4 font-mono text-xs text-muted-foreground">
            90 seconds · Approve and decline · Synthetic data
          </figcaption>
          <video
            className="aspect-video w-full bg-black"
            controls
            playsInline
            preload="none"
            poster="/demo/approve-and-decline.jpg"
            width={1920}
            height={1080}
            aria-label="Approve one proposed Observation, decline the next, and compare what the local FHIR store kept"
            aria-describedby="walkthrough-description"
          >
            <source src="/demo/approve-and-decline.mp4" type="video/mp4" />
            <track kind="captions" src="/demo/approve-and-decline.vtt" srcLang="en" label="English" />
            <a href="/demo/approve-and-decline.mp4">Download the walkthrough</a>
          </video>
          <div className="p-5 sm:p-7">
            <p className="text-xl font-medium leading-8 tracking-tight">
              Approve one write. Decline the next.
            </p>
            <p id="walkthrough-description" className="mt-3 text-sm leading-6 text-muted-foreground">
              {walkthroughDescription}
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm underline underline-offset-4">
              <a href="/demo/approve-and-decline.mp4">Watch full size</a>
              <Link href="/docs/quickstart#recorded-approval-and-cancellation">Transcript</Link>
              <a href="/demo/approve-and-decline.proof.json">FHIR proof (JSON)</a>
              <a href={GITHUB_REPO}>GitHub repo</a>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}
