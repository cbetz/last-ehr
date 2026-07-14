"use client";

import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from "next-themes";

// Site-wide context stops at theming. Everything demo-specific (Medplum
// client, analytics, tooltips) lives in components/demo/demo-providers.tsx so
// the marketing and docs routes don't carry it in first-load JS.
export function Providers({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
