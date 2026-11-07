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
  { href: "/#coverage", label: "What it does" },
  { href: "/#mcp", label: "MCP" },
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
      className="px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
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
      className="sticky top-0 z-40 border-b marketing-rule bg-background/95 backdrop-blur-xl"
    >
      <div className="container flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Last EHR home" className="shrink-0">
          <BrandMark />
        </Link>

        <div className="hidden items-center gap-4 lg:flex">
          {navigation.map((item) => (
            <NavigationLink key={item.label} {...item} />
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <ModeToggle />
          <Link
            href="https://github.com/cbetz/last-ehr"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "rounded-sm px-3",
            })}
          >
            <IconGitHub className="mr-2 h-4 w-4" aria-hidden="true" />
            Star on GitHub
          </Link>
          <Link
            href="/demo"
            className={buttonVariants({
              size: "sm",
              className: "rounded-sm px-4",
            })}
          >
            Try the demo
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
                  className={buttonVariants({
                    variant: "outline",
                    className: "mt-4 rounded-sm",
                  })}
                >
                  <IconGitHub className="mr-2 h-4 w-4" aria-hidden="true" />
                  Star on GitHub
                </Link>
                <Link
                  href="/demo"
                  onClick={() => setIsOpen(false)}
                  className={buttonVariants({ className: "mt-3 rounded-sm" })}
                >
                  Try the demo
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
