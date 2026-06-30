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

        <section id="signup" className="container py-24 sm:py-32">
          <div className="mx-auto w-full max-w-[600px] space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-3xl md:text-4xl font-bold">
                <span className="bg-gradient-to-b from-primary/60 to-primary text-transparent bg-clip-text">
                  Want it hosted?
                </span>
              </h2>
              <p className="text-muted-foreground text-xl">
                Self-hosting is free and open source. If you&apos;d rather we run
                it for you — managed Medplum, a signed BAA, no infra to operate —
                leave your email and we&apos;ll reach out as the hosted version
                comes together.
              </p>
            </div>

            <SignupForm />

            <p className="px-2 text-center text-sm leading-normal text-muted-foreground">
              Prefer to self-host?{" "}
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
