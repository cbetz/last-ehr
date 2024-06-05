import Link from "next/link";

import { Button } from "./ui/button";
import { buttonVariants } from "./ui/button";
import { ChevronLastIcon, Twitter } from "lucide-react";

const Hero = () => {
  return (
    <section className="container grid lg:grid-cols-2 place-items-center py-20 md:py-32 gap-10">
      <div className="text-center lg:text-start space-y-6">
        <main className="text-5xl md:text-6xl font-bold">
          <h1 className="inline">
            <span className="bg-gradient-to-b from-primary/60 to-primary text-transparent bg-clip-text">
              Last EHR
            </span>
          </h1>
        </main>

        <p className="text-xl text-muted-foreground md:w-10/12 mx-auto lg:mx-0">
          Last EHR is a low code platform that allows you spend less time
          building and more time to focus on your patients and providers.
        </p>

        <div className="space-y-4 md:space-y-0 md:space-x-4">
          <Link
            href="#howItWorks"
            className={`w-full md:w-1/3 ${buttonVariants({
              variant: "default",
            })}`}
          >
            Learn More
          </Link>

          <Link
            href="https://x.com/lastehr"
            target="_blank"
            className={`w-full md:w-1/3 ${buttonVariants({
              variant: "outline",
            })}`}
          >
            Twitter
            <Twitter className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Hero cards sections */}
      <div className="z-10">
        <ChevronLastIcon size={100} className="animate-pulse" />
      </div>

      {/* Shadow effect */}
      <div className="shadow"></div>
    </section>
  );
};

export default Hero;
