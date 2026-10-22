"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { IconClose } from "@/components/ui/icons";
import { track } from "@/lib/analytics";

const STORAGE_KEY = "lastehr-demo-conversion-dismissed";

// Read the per-browser dismissal flag so the parent can decide whether to
// show the card at all; dismissal writes the same key below.
export function conversionCardDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Storage unavailable (private mode); treat as not dismissed.
    return false;
  }
}

const secondaryLinks = [
  {
    target: "source",
    label: "View source",
    href: "https://github.com/cbetz/last-ehr",
    external: true,
  },
  {
    target: "docs",
    label: "Read the docs",
    href: "/docs",
    external: false,
  },
] as const;

// Shown after a confirmed save or cancellation, rather than an approval click
// whose request may fail. Clicking a link does not dismiss the card;
// only the X does, and that dismissal persists per browser.
export function ConversionCard({ onDismiss }: { onDismiss: () => void }) {
  // Ref guard keeps the shown event single even when StrictMode
  // double-invokes the mount effect in dev.
  const trackedShown = useRef(false);
  useEffect(() => {
    if (trackedShown.current) return;
    trackedShown.current = true;
    track("demo_conversion_shown");
  }, []);

  return (
    <Card className="relative">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            window.localStorage.setItem(STORAGE_KEY, "1");
          } catch {
            // Storage unavailable; the card just returns next session.
          }
          onDismiss();
        }}
        className="absolute right-2 top-2 rounded p-1.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconClose className="h-3.5 w-3.5" />
      </button>
      <CardHeader className="pb-2">
        <CardTitle className="pr-6 text-base font-medium">
          Run the approval flow on your machine
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The local walkthrough uses synthetic records in HAPI FHIR. You need
          Node.js and Docker, but no Medplum account or model API key.
        </p>
        <Link
          href="/docs/quickstart"
          className={buttonVariants()}
          onClick={() => track("demo_conversion_clicked", { target: "run_local" })}
        >
          Run locally
        </Link>
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-sm text-muted-foreground">
          {secondaryLinks.map((link) => (
            <Link
              key={link.target}
              href={link.href}
              {...(link.external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              onClick={() =>
                track("demo_conversion_clicked", { target: link.target })
              }
              className="font-medium text-foreground underline underline-offset-4"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
