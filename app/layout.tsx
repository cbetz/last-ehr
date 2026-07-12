import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.lastehr.com"),
  title: {
    default: "Last EHR: Approval-gated FHIR agents",
    template: "%s | Last EHR",
  },
  description:
    "Open-source FHIR agent infrastructure for bounded chart context, structured proposals, explicit approval gates, a read-only MCP Local Lab, and synthetic workflow evaluation.",
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
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Last EHR",
    title: "Last EHR: Approval-gated FHIR agents",
    description:
      "FHIR agents with bounded context, structured proposals, and an explicit human decision before every write. Open source and synthetic-data-first.",
    url: "https://www.lastehr.com",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Last EHR: Approval-gated FHIR agents",
    description:
      "FHIR agents with bounded context, structured proposals, and an explicit human decision before every write.",
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
