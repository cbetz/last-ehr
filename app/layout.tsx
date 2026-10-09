import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.lastehr.com"),
  title: {
    default: "Last EHR: AI tools for FHIR patient charts",
    template: "%s | Last EHR",
  },
  description:
    "Open-source AI tools to read FHIR patient charts and propose notes, observations, and tasks. Review each write before it saves. Web app and MCP server.",
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
    title: "Last EHR: AI tools for FHIR patient charts",
    description:
      "Search patients, read charts, and review proposed notes, observations, and tasks before they save. Open source. Try it with synthetic data.",
    url: "https://www.lastehr.com",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Last EHR: AI tools for FHIR patient charts",
    description:
      "Read FHIR patient charts and review proposed changes before they save. Use the web app or connect your agent through MCP. Open-source alpha.",
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
