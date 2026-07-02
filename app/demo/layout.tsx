import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Demo",
  description:
    "Try Last EHR's AI agent on a live FHIR backend: look up patients, view charts, and record to the chart with approval on every write.",
  alternates: { canonical: "/demo" },
  openGraph: {
    type: "website",
    title: "Live Demo | Last EHR",
    description:
      "Try Last EHR's AI agent on a live FHIR backend: look up patients, view charts, and record to the chart with approval on every write.",
    url: "https://www.lastehr.com/demo",
  },
};

export default function DemoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
