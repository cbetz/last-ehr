import Link from "next/link";
import Image from "next/image";

import { buttonVariants } from "./ui/button";
import { IconTwitter } from "./ui/icons";
import demoImage from "@/public/demo.png";

const Hero = () => {
  return (
    <section className="container grid place-items-center gap-10 py-20 md:py-32 lg:grid-cols-2">
      <div className="space-y-6 text-center lg:text-start">
        <h1 className="text-4xl font-bold leading-tight md:text-6xl">
          The{" "}
          <span className="bg-gradient-to-b from-primary/60 to-primary bg-clip-text text-transparent">
            AI-native EHR
          </span>{" "}
          for modern clinical teams
        </h1>

        <p className="mx-auto text-xl text-muted-foreground md:w-10/12 lg:mx-0">
          Last EHR is a low-code platform that lets you spend less time building
          infrastructure and more time focused on your patients and providers.
        </p>

        <div className="space-y-4 md:space-x-4 md:space-y-0">
          <Link
            href="#howItWorks"
            className={`w-full md:w-1/3 ${buttonVariants({ variant: "default" })}`}
          >
            Learn More
          </Link>

          <Link
            href="https://x.com/lastehr"
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full md:w-1/3 ${buttonVariants({ variant: "outline" })}`}
          >
            Twitter
            <IconTwitter className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="relative z-10 w-full">
        <Image
          src={demoImage}
          alt="The Last EHR clinician dashboard showing a patient chart and AI assistant"
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
