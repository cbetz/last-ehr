"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ThemeProviderProps } from "next-themes/dist/types";
import { MedplumClient } from "@medplum/core";
import { MedplumProvider } from "@medplum/react-hooks";

import { TooltipProvider } from "@/components/ui/tooltip";

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
    <NextThemesProvider {...props}>
      <TooltipProvider delayDuration={0}>
        <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
      </TooltipProvider>
    </NextThemesProvider>
  );
}
