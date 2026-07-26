import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.lastehr.com"),
  title: {
    default: "Last EHR: the agent layer for your FHIR EHR",
    template: "%s | Last EHR",
  },
  description:
    "The agent layer for a headless FHIR EHR. Reads the chart broadly (25 of US Core's 27 readable resource types), is built so it cannot report an absence it never checked for, and turns every write into a proposal a human approves. Five backends, one interface, protocol and conformance suite included.",
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
    "MCP FHIR",
    "FHIR agent safety eval",
    "approval gated AI",
    "FHIR agent write protocol",
    "agent conformance suite",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Last EHR",
    title: "Last EHR: the agent layer for your FHIR EHR",
    description:
      "Reads the chart broadly, will not report an absence it never checked for, and turns every write into a proposal a human approves. Five FHIR backends, one interface. Open source and synthetic-data-first.",
    url: "https://www.lastehr.com",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Last EHR: the agent layer for your FHIR EHR",
    description:
      "Read the chart broadly. Write only what a human approved. 25 of US Core's 27 readable resource types, five FHIR backends, and an open protocol with a conformance suite.",
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
    { media: "(prefers-color-scheme: light)", color: "#f7f5ef" },
    { media: "(prefers-color-scheme: dark)", color: "#101219" },
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
      <body className="min-h-screen bg-background font-sans antialiased">
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
