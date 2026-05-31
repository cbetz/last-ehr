"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLast, Menu } from "lucide-react";

import { IconTwitter } from "@/components/ui/icons";
import { NavigationMenu } from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { Button, buttonVariants } from "./ui/button";
import { ModeToggle } from "./ModeToggle"; 

interface RouteProps {
  href: string;
  label: string;
}

const routeList: RouteProps[] = [
  {
    href: "#howItWorks",
    label: "How It Works",
  },
  {
    href: "#ai",
    label: "AI Agents",
  },
  {
    href: "#signup",
    label: "Sign Up",
  },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  return (
    <nav className="sticky border-b-[1px] top-0 z-40 w-full bg-background">
      <NavigationMenu className="mx-auto">
        <div className="container h-16 px-4 flex justify-between items-center">
          <div className="font-bold flex">
            <Link href="/" className="ml-2 font-bold text-xl flex">
              <ChevronLast className="mr-4" />
              Last EHR
            </Link>
          </div>

          {/* mobile */}
          <div className="flex md:hidden">
            <ModeToggle />
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <Button
                onClick={() => setIsOpen(true)}
                variant="ghost"
                className="px-2"
              >
                <span className="sr-only">Open Menu</span>
                <Menu className="flex md:hidden h-5 w-5" />
              </Button>

              <SheetContent side={"left"}>
                <SheetHeader>
                  <SheetTitle className="font-bold text-xl text-start">
                    Last EHR
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col justify-center items-start space-y-3 mt-6">
                  <ul className="flex flex-col space-y-3">
                    {routeList.map(({ href, label }: RouteProps) => (
                      <li key={label}>
                        <Link
                          key={label}
                          href={href}
                          onClick={() => setIsOpen(false)}
                          className={buttonVariants({
                            variant: "ghost",
                          })}
                        >
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="https://x.com/lastehr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-[110px] border ${buttonVariants({
                      variant: "ghost",
                    })}`}
                  >
                    <IconTwitter className="h-4 w-4 mr-2" aria-hidden="true" /> Twitter
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* desktop */}
          <div className="hidden md:flex gap-2">
            <ul className="flex space-x-2">
              {routeList.map((route: RouteProps, i) => (
                <li key={i}>
                  <Link
                    href={route.href}
                    className={`text-[17px] ${buttonVariants({
                      variant: "ghost",
                    })}`}
                  >
                    {route.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="hidden md:flex gap-2">
            <div className="flex space-x-2">
              <Link
                href="https://x.com/lastehr"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Last EHR on Twitter"
                className={`border ${buttonVariants({
                  variant: "ghost",
                })}`}
              >
                <IconTwitter className="h-4 w-4" aria-hidden="true" />
              </Link>

              <ModeToggle />
            </div>
          </div>
        </div>
      </NavigationMenu>
    </nav>
  );
};

export default Navbar;
