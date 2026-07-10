import type { Metadata, Viewport } from "next";
import { Inter as FontSans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { JsonLd } from "@/components/json-ld";

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.lastehr.com"),
  title: {
    default: "Last EHR: Open-source approval-gated FHIR agents",
    template: "%s | Last EHR",
  },
  description:
    "An open-source reference implementation for approval-gated FHIR agents. The agent reads the chart and proposes writes; nothing is saved until you approve it. Medplum-supported, HAPI for local synthetic evaluation, Apache-2.0.",
  applicationName: "Last EHR",
  keywords: [
    "EHR",
    "EMR",
    "Electronic Health Record",
    "FHIR",
    "AI agent EHR",
    "FHIR AI agent",
    "Medplum",
    "headless EHR",
    "headless EMR",
    "healthcare AI agents",
    "open source EHR tools",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Last EHR",
    title: "Last EHR: Open-source approval-gated FHIR agents",
    description:
      "An AI agent over the patient chart with explicit human approval on every write. Open source, self-hosted, Medplum-supported.",
    url: "https://www.lastehr.com",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Last EHR: Open-source approval-gated FHIR agents",
    description:
      "An AI agent over the patient chart with explicit human approval on every write. Open source, self-hosted, Medplum-supported.",
    site: "@lastehr",
    creator: "@lastehr",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          fontSans.variable,
        )}
      >
        <JsonLd />
        <Providers
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
