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
                  Get early access
                </span>
              </h2>
              <p className="text-muted-foreground text-xl">
                Sign up for early access to Last EHR.
              </p>
            </div>

            <SignupForm />

            <p className="px-2 text-center text-sm leading-normal text-muted-foreground">
              Already have access?{" "}
              <Link href="/demo" className="font-medium underline">
                Open the live demo
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
