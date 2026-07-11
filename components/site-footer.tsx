import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { BrandMark } from "./brand-mark";
import { IconGitHub } from "./ui/icons";

const footerGroups = [
  {
    title: "Product",
    links: [
      { href: "/demo", label: "Live demo" },
      { href: "/approval-gated-writes", label: "Safety model" },
      { href: "/roadmap", label: "Roadmap" },
    ],
  },
  {
    title: "Build",
    links: [
      { href: "/docs/quickstart#zero-key-local-synthetic-demo-with-hapi-fhir", label: "Run locally" },
      { href: "/docs", label: "Documentation" },
      {
        href: "/docs/adapters",
        label: "Backend adapters",
      },
    ],
  },
  {
    title: "Project",
    links: [
      {
        href: "https://github.com/cbetz/last-ehr",
        label: "GitHub",
      },
      {
        href: "https://github.com/cbetz/last-ehr/blob/main/CONTRIBUTING.md",
        label: "Contributing",
      },
      { href: "/#signup", label: "Hosted updates" },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/70 bg-background">
      <div className="container grid gap-12 py-12 sm:py-16 lg:grid-cols-[1.1fr_1.9fr]">
        <div className="max-w-sm">
          <Link href="/" aria-label="Last EHR home">
            <BrandMark />
          </Link>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            An open-source reference implementation for approval-gated FHIR
            agents. Built for inspection, not abstraction.
          </p>
          <Link
            href="https://github.com/cbetz/last-ehr"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
          >
            <IconGitHub className="h-4 w-4" aria-hidden="true" />
            Star the project
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <nav aria-label="Footer" className="grid gap-8 sm:grid-cols-3">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-primary">
                {group.title}
              </h2>
              <ul className="mt-4 space-y-3">
                {group.links.map(({ href, label }) => {
                  const external = href.startsWith("http");
                  return (
                    <li key={label}>
                      <Link
                        href={href}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noopener noreferrer" : undefined}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="container flex flex-col gap-3 border-t border-border/70 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} Last EHR. Apache-2.0.</p>
        <p>A personal open-source project. Not affiliated with Medplum or Vercel.</p>
      </div>
    </footer>
  );
}
