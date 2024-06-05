"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import { useFormState } from "react-dom";
import { create } from "./form-actions";
import AI from "@/components/AI";
import { HowItWorks } from "@/components/HowItWorks";

const initialState = {
  message: "",
};

export default function Component() {
  const [state, formAction] = useFormState(create, initialState);

  return (
    <div key="1">
      <Navbar />
      <Hero />
      <HowItWorks />
      <AI />
      <div className="container py-24 sm:py-32">
        <div className="w-full max-w-[600px] space-y-4 xl:grid xl:gap-4 xl:w-1/2">
          <div className="space-y-2">
            <h2 className="text-3xl md:text-4xl font-bold">
              <span className="bg-gradient-to-b from-primary/60 to-primary text-transparent bg-clip-text">
                Sign Up{" "}
              </span>
            </h2>

            <p className="text-muted-foreground text-xl mt-4 mb-8 ">
              Sign up to for early access to Last EHR.
            </p>
          </div>
          <div className="space-y-2 xl:mt-8">
            <form className="grid gap-2" action={formAction}>
              <Input id="name" name="name" placeholder="Name" required />
              <Input
                id="email"
                name="email"
                placeholder="Email"
                required
                type="email"
              />
              <Button type="submit">Sign Up</Button>
            </form>
            <p className="text-sm text-center text-muted-foreground">
              {state?.message}
            </p>
            <p className="px-2 text-center text-sm leading-normal text-muted-foreground">
              <Link href="/demo">
                Already have access? Click here to access the live demo.
              </Link>
            </p>
            {/*<p className="text-xs text-gray-500 dark:text-gray-400">
              By providing your email, you agree to our {" "}
              <Link className="underline underline-offset-2" href="#">
                Terms & Conditions
              </Link>{" "}
              and{" "}
              <Link className="underline underline-offset-2" href="#">
                Privacy Policy
              </Link>
              .
            </p>*/}
          </div>
        </div>
      </div>
    </div>
  );
}
