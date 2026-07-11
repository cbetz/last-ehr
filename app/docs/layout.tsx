import type { ReactNode } from "react";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
      <SiteFooter />
    </>
  );
}
