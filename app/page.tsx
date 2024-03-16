import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { sql } from '@vercel/postgres';
import Image from "next/image";

async function create(formData: FormData) {
    'use server';

    console.log('Creating waitlist entry');

    try {
      const name = formData.get('name') as string;
      const email = formData.get('email') as string;
      console.log(formData);
      if (!name || !email) {
        return;
      }
      const { rows } = await sql`
        INSERT INTO waitlist (name, email)
        VALUES (${name}, ${email})
      `;
    } catch (err) {
        console.error(err);
        }
  }

export default function Component() {
  return (
    <div key="1">
      <div className="container flex flex-col items-center justify-center min-h-screen py-12 space-y-4 md:py-24 xl:space-y-8 xl:flex-row xl:gap-0">
        <Image
          alt="Hero"
          className="aspect-video overflow-hidden rounded-[24px] object-cover object-center xl:w-1/2 mr-4"
          height="225"
          src="/demo.png"
          width="400"
        />
        <div className="w-full max-w-[600px] space-y-4 xl:grid xl:gap-4 xl:w-1/2">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl xl:text-5xl/none">
              Last EHR
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Sign up to experience an AI powered EHR.
            </p>
          </div>
          <div className="space-y-2 xl:mt-8">
            <form className="grid gap-2" action={create}>
              <Input id="name" name="name" placeholder="Name" required />
              <Input id="email" name="email" placeholder="Email" required type="email" />
              <Button type="submit">Sign Up</Button>
            </form>
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
  )
}

