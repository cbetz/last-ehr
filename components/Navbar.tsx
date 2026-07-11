"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { IconGitHub } from "@/components/ui/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { ModeToggle } from "./ModeToggle";

type NavigationItem = {
  href: string;
  label: string;
};

const navigation: NavigationItem[] = [
  { href: "/#workflow", label: "Workflow" },
  { href: "/approval-gated-writes", label: "Safety" },
  { href: "/docs", label: "Docs" },
  { href: "/roadmap", label: "Roadmap" },
];

function NavigationLink({ href, label, onClick }: NavigationItem & { onClick?: () => void }) {
  const external = href.startsWith("http");

  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      onClick={onClick}
      className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {label}
    </Link>
  );
}

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav
      aria-label="Primary navigation"
      className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl"
    >
      <div className="container flex h-[4.75rem] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Last EHR home" className="shrink-0">
          <BrandMark />
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {navigation.map((item) => (
            <NavigationLink key={item.label} {...item} />
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="https://github.com/cbetz/last-ehr"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <IconGitHub className="h-4 w-4" aria-hidden="true" />
            GitHub
          </Link>
          <ModeToggle />
          <Link
            href="/docs/quickstart#zero-key-local-synthetic-demo-with-hapi-fhir"
            className={buttonVariants({
              size: "sm",
              className:
                "rounded-full px-4 shadow-[0_10px_30px_-16px_hsl(var(--primary))]",
            })}
          >
            Run locally
          </Link>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ModeToggle />
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
            <SheetContent side="right" className="w-[min(88vw,23rem)] border-border bg-background p-6">
              <SheetHeader className="flex-row items-center justify-between space-y-0 text-left">
                <SheetTitle>
                  <BrandMark />
                </SheetTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close navigation menu"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </SheetHeader>
              <div className="mt-10 grid gap-2">
                {navigation.map((item) => (
                  <NavigationLink
                    key={item.label}
                    {...item}
                    onClick={() => setIsOpen(false)}
                  />
                ))}
                <Link
                  href="https://github.com/cbetz/last-ehr"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsOpen(false)}
                  className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <IconGitHub className="h-4 w-4" aria-hidden="true" />
                  View source on GitHub
                </Link>
                <Link
                  href="/docs/quickstart#zero-key-local-synthetic-demo-with-hapi-fhir"
                  onClick={() => setIsOpen(false)}
                  className={buttonVariants({ className: "mt-4 rounded-full" })}
                >
                  Run locally
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
