import type { Metadata } from "next";

import { DemoProviders } from "@/components/demo/demo-providers";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Live Demo",
  description:
    "Try Last EHR's AI agent on a live FHIR backend: look up patients, view charts, and record to the chart with approval on every write.",
  path: "/demo",
  type: "website",
  cardTitle: "Live Demo | Last EHR",
});

export default function DemoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <DemoProviders>{children}</DemoProviders>;
}
