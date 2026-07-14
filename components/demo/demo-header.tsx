"use client";

import Link from "next/link";
import { useMedplum, useMedplumProfile } from "@medplum/react-hooks";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/ModeToggle";

const scriptedDemo = process.env.NEXT_PUBLIC_SCRIPTED_DEMO === "true";

export function DemoHeader() {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  async function signOut() {
    try {
      await medplum.signOut();
    } finally {
      // Clear the server-set HttpOnly session cookie.
      await fetch("/api/auth/session", { method: "DELETE" });
      window.location.href = "/demo";
    }
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background">
      <div className="container flex h-16 items-center justify-between gap-3 px-4">
        <Link
          href="/"
          aria-label="Last EHR home"
          className="flex min-w-0 items-center gap-2.5"
        >
          <BrandMark className="shrink-0" />
          {/* min-w-0 + truncate: on a narrow screen the pill ellipsizes
              instead of wrapping or pushing the header into overflow. */}
          <span className="min-w-0 truncate rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {scriptedDemo ? "Scripted local demo" : "Live Demo"}
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          {profile && (
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="hidden sm:inline-flex"
          >
            <Link href="/docs">Docs</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">Back to site</Link>
          </Button>
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
