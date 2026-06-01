"use client";

import { SignInForm } from "@/components/medplum/auth/SignInForm";
import { SignupForm } from "@/components/SignupForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const googleClientId = process.env.NEXT_PUBLIC_MEDPLUM_GOOGLE_CLIENT_ID;

export function DemoGate() {
  return (
    <div className="container flex flex-1 flex-col items-center gap-6 py-12 md:py-16">
      <div className="max-w-md space-y-2 text-center">
        <h1 className="text-3xl font-bold">Try the live demo</h1>
        <p className="text-muted-foreground">
          An interactive AI assistant connected to a live{" "}
          <span className="font-medium text-foreground">Medplum</span> headless
          EHR. Look up patients and view charts in plain language.
        </p>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Sign in with Medplum</CardTitle>
          <CardDescription>
            The demo authenticates against your{" "}
            <a
              href="https://www.medplum.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Medplum
            </a>{" "}
            account to securely access patient data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {googleClientId ? (
            <SignInForm googleClientId={googleClientId} disableEmailAuth />
          ) : (
            <Alert variant="destructive">
              <AlertTitle>Sign-in isn’t configured</AlertTitle>
              <AlertDescription>
                Set <code>NEXT_PUBLIC_MEDPLUM_GOOGLE_CLIENT_ID</code> — a Google
                OAuth client registered with your Medplum project — to enable
                sign-in.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="w-full max-w-md bg-muted/50">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">No access yet?</CardTitle>
          <CardDescription>
            Join the waitlist for early access to Last EHR.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm />
        </CardContent>
      </Card>
    </div>
  );
}
