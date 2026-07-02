import Link from "next/link";
import { ChevronLast } from "lucide-react";

import { IconTwitter } from "./ui/icons";

const footerLinks = [
  { href: "/headless-ehr", label: "Headless EHR" },
  { href: "/medplum-ai-agent", label: "Medplum AI Agent" },
  { href: "/approval-gated-writes", label: "Approval-Gated Writes" },
  { href: "/chat-with-fhir-data", label: "Chat with FHIR Data" },
  { href: "/#howItWorks", label: "How It Works" },
  { href: "/#signup", label: "Sign Up" },
  { href: "/demo", label: "Live Demo" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t">
      <div className="container flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <ChevronLast className="h-5 w-5" aria-hidden="true" />
            Last EHR
          </Link>
          <p className="text-sm text-muted-foreground max-w-xs">
            An open-source AI agent layer for Medplum and FHIR.
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {footerLinks.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <a
          href="https://x.com/lastehr"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <IconTwitter className="h-4 w-4" aria-hidden="true" />
          <span>@lastehr</span>
        </a>
      </div>
      <div className="container pb-8">
        <p className="text-xs text-muted-foreground">
          © {year} Last EHR. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
