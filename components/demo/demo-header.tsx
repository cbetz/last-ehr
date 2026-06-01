"use client";

import Link from "next/link";
import { ChevronLast } from "lucide-react";
import { useMedplum, useMedplumProfile } from "@medplum/react-hooks";

import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/ModeToggle";

export function DemoHeader() {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  async function signOut() {
    try {
      await medplum.signOut();
    } finally {
      // Clear the server-readable token cookie set during sign-in.
      document.cookie = "medplum_access_token=; Max-Age=0; path=/";
      window.location.href = "/demo";
    }
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background">
      <div className="container flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          <ChevronLast className="h-5 w-5" aria-hidden="true" />
          Last EHR
          <span className="ml-1 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Live Demo
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {profile && (
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/">Back to site</Link>
          </Button>
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
