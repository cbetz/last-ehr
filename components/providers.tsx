"use client";

import * as React from "react";
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from "next-themes";
import { MedplumClient } from "@medplum/core";
import { MedplumProvider } from "@medplum/react-hooks";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { TooltipProvider } from "@/components/ui/tooltip";

// PostHog is optional — self-hosters without a key get no analytics rather
// than a first-run crash.
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  });
}

const medplum = new MedplumClient({
  // Point at your own Medplum via NEXT_PUBLIC_MEDPLUM_BASE_URL
  // (e.g. http://localhost:8103/); falls back to Medplum's hosted API.
  baseUrl: process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL,

  // Handle unauthenticated requests
  onUnauthenticated: () => (window.location.href = "/"),

  // Use Next.js fetch
  fetch: (url: string, options?: any) => fetch(url, options),

  // Recommend using cache for React performance
  cacheTime: 10000,
});

export function Providers({ children, ...props }: ThemeProviderProps) {
  return (
    <PostHogProvider client={posthog}>
      <NextThemesProvider {...props}>
        <TooltipProvider delayDuration={0}>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </TooltipProvider>
      </NextThemesProvider>
    </PostHogProvider>
  );
}
