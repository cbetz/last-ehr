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

if (typeof window !== "undefined") {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  });
}

const medplum = new MedplumClient({
  // Uncomment this to run against the server on your localhost
  // baseUrl: 'http://localhost:8103/',

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
