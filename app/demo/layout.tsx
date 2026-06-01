import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Demo",
  description:
    "Try Last EHR's interactive AI assistant connected to a live headless EHR — look up patients and view charts in natural language.",
  alternates: { canonical: "/demo" },
};

export default function DemoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
