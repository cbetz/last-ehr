"use client";

import * as React from "react";
import { MedplumClient } from "@medplum/core";
import { MedplumProvider } from "@medplum/react-hooks";
import posthog from "posthog-js";

import { DemoBackendProvider } from "@/components/demo/demo-backend";
import { TooltipProvider } from "@/components/ui/tooltip";

// Demo-only client context. This module must stay out of the root layout:
// the marketing/docs pages import no Medplum or analytics code, and keeping
// these providers here keeps that weight out of their first-load JS.

// PostHog is optional: self-hosters without a key get no analytics rather
// than a first-run crash.
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    // Policy constraint (see /privacy): explicit events via lib/analytics.ts
    // only, nothing persisted on-device, no profiles, no recording.
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    persistence: "memory",
    person_profiles: "never",
  });
}

const medplum = new MedplumClient({
  // Point at your own Medplum via NEXT_PUBLIC_MEDPLUM_BASE_URL
  // (e.g. http://localhost:8103/); falls back to Medplum's hosted API.
  baseUrl: process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL || undefined,

  // Handle unauthenticated requests
  onUnauthenticated: () => (window.location.href = "/"),

  // Use Next.js fetch
  fetch: (url: string, options?: any) => fetch(url, options),

  // Recommend using cache for React performance
  cacheTime: 10000,
});

export function DemoProviders({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={0}>
      <MedplumProvider medplum={medplum}>
        <DemoBackendProvider>{children}</DemoBackendProvider>
      </MedplumProvider>
    </TooltipProvider>
  );
}
