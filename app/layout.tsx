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
    default: "Last EHR — AI-Powered Electronic Health Record",
    template: "%s | Last EHR",
  },
  description:
    "Last EHR is a low-code, AI-native Electronic Health Record platform. Pick a headless EHR, connect your integrations, and add AI agents — so you can focus on patients and providers, not infrastructure.",
  applicationName: "Last EHR",
  keywords: [
    "EHR",
    "EMR",
    "Electronic Health Record",
    "Electronic Medical Record",
    "AI EHR",
    "AI-powered EHR",
    "headless EHR",
    "headless EMR",
    "low-code EHR",
    "healthcare AI agents",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Last EHR",
    title: "Last EHR — AI-Powered Electronic Health Record",
    description:
      "The AI-native, low-code EHR platform. Pick a headless EHR, connect integrations, and add AI agents.",
    url: "https://www.lastehr.com",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Last EHR — AI-Powered Electronic Health Record",
    description:
      "The AI-native, low-code EHR platform. Pick a headless EHR, connect integrations, and add AI agents.",
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
