import type { Metadata } from "next";

import { pageMetadata } from "@/lib/seo";
import Link from "next/link";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = pageMetadata({
  title: "Privacy",
  description:
    "What lastehr.com collects and why: explicit-event analytics, the waitlist form, functional cookies, rate limiting, and AI processing in the demo.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main>
        <article>
          <section className="container max-w-3xl py-16 sm:py-24">
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">
              Privacy
            </h1>
            <p className="mt-6 text-xl text-muted-foreground">
              Last EHR is a personal open-source project, and I want the data
              story to be as small and boring as possible. This page describes
              exactly what the hosted site collects and why, in plain terms.
              Effective July 11, 2026.
            </p>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">What this covers</h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                This page covers the hosted site at lastehr.com, including the
                live demo. It does not cover deployments you run yourself from
                the source code; those are addressed in the self-hosted section
                below.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">Analytics</h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                The hosted site uses PostHog, configured to capture only
                explicit events I chose to instrument: a small set of product
                interaction events in the demo, such as clicking a starter
                prompt, sending a message, or approving a proposed write. Event
                properties never include the content of your chat or any chart
                data.
              </p>
              <p>
                Autocapture, automatic pageview tracking, session recording,
                and surveys are all disabled. Analytics state is kept in memory
                only, so nothing is written to your device, and no person
                profiles are created. Analytics only run on the hosted site; a
                build without the PostHog key sends nothing.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">Waitlist</h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                If you join the waitlist, I store the name and email you
                submit, along with the referring page, your browser&apos;s user
                agent, and your IP address, in a Postgres database (Neon).
                The extra fields exist to spot bot floods, nothing else.
                Entries are deduplicated by email. I use this list only to send
                updates about the project, and I do not share or sell it.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">Cookies</h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                The site sets functional cookies only; there are no tracking
                cookies. The ones you may see:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-foreground">
                    medplum_access_token
                  </strong>
                  : an HttpOnly session token used to talk to the FHIR
                  backend.
                </li>
                <li>
                  <strong className="text-foreground">demo_session_id</strong>:
                  an HttpOnly random identifier that isolates your demo writes
                  from other visitors&apos;.
                </li>
                <li>
                  <strong className="text-foreground">smart_session</strong>: a
                  non-secret marker indicating a SMART on FHIR launch.
                </li>
                <li>
                  <strong className="text-foreground">
                    smart_state, smart_verifier, smart_token_endpoint
                  </strong>
                  : transient values used during a SMART launch handshake.
                </li>
              </ul>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">Rate limiting</h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                To keep the demo usable, requests are rate limited by client IP
                using a sliding 60-second window. On the hosted site the
                counters live briefly in Upstash Redis with its analytics
                disabled; the IP is used as a counter key and expires with the
                window. Self-hosted deployments without Upstash configured fall
                back to an in-memory limiter, so the IP never leaves the
                process.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">AI processing</h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                When you use the demo chat, your messages and the synthetic
                chart context are sent to the configured model provider to
                generate a response. The site stores no transcripts. All demo
                patient data is synthetic. Please do not paste real patient
                information into the demo; it would be sent to the model
                provider like any other message.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">Server logs</h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                The server logs errors and operational warnings. When a chat
                request fails, the log line records the error type, message,
                and status code, not the content of your messages or the chart
                context.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">Self-hosted deployments</h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                If you run Last EHR from source or self-host it, none of the
                hosted-site analytics or waitlist collection happens by
                default: the PostHog key is unset and there is no waitlist
                database. What your deployment sends to your FHIR backend and
                your model provider is between you and them.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">Changes to this page</h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                If the site starts collecting something new, I will update this
                page and the effective date at the top. The page&apos;s history
                is visible in the{" "}
                <Link
                  href="https://github.com/cbetz/last-ehr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  repository
                </Link>
                . Questions: open a GitHub issue.
              </p>
            </div>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
