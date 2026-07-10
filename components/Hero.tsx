import Link from "next/link";
import Image from "next/image";

import { buttonVariants } from "./ui/button";
import { IconGitHub } from "./ui/icons";
import demoImage from "@/public/demo.png";

const Hero = () => {
  return (
    <section className="container grid place-items-center gap-10 py-20 md:py-32 lg:grid-cols-2">
      <div className="space-y-6 text-start">
        <h1 className="text-4xl font-bold leading-tight md:text-6xl">
          Approval-gated FHIR agents, open source
        </h1>

        <p className="text-xl text-muted-foreground md:w-10/12">
          A reference implementation for agents that can read the chart and
          only write what a person explicitly approves. Run it with Medplum,
          or evaluate the approval loop locally against HAPI FHIR with
          synthetic data and no external model key.
        </p>

        <div className="space-y-4 md:space-x-4 md:space-y-0">
          <Link
            className={`w-full md:w-auto ${buttonVariants({ variant: "default" })}`}
            href="/demo"
          >
            Try the live demo
          </Link>

          <Link
            href="/docs"
            className={`w-full md:w-auto ${buttonVariants({ variant: "outline" })}`}
          >
            Run locally
          </Link>

          <Link
            href="https://github.com/cbetz/last-ehr"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            <IconGitHub className="mr-2 h-4 w-4" aria-hidden="true" />
            View source
          </Link>
        </div>
      </div>

      <div className="relative z-10 w-full">
        <Image
          src={demoImage}
          alt="The Last EHR demo proposing a heart rate observation for a patient, with Cancel and Approve & save buttons. Nothing is saved to the chart until the user approves."
          priority
          placeholder="blur"
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="rounded-lg border shadow-2xl"
        />
      </div>
    </section>
  );
};

export default Hero;
