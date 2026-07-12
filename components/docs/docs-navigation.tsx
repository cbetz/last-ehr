import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import {
  getDocHref,
  getPreviousAndNextDoc,
  type DocsRegistryEntry,
} from "@/lib/docs/registry";

type DocsNavigationProps = {
  doc: DocsRegistryEntry;
};

export function DocsNavigation({ doc }: DocsNavigationProps) {
  const { previous, next } = getPreviousAndNextDoc(doc);

  if (!previous && !next) {
    return null;
  }

  return (
    <nav aria-label="Documentation sequence" className="mt-14 grid gap-3 border-t border-border pt-7 sm:grid-cols-2">
      {previous ? (
        <Link
          href={getDocHref(previous)}
          className="group border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Previous
          </span>
          <span className="mt-3 block text-sm font-semibold text-foreground group-hover:text-primary">
            {previous.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={getDocHref(next)}
          className="group border border-border bg-card p-4 text-right transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <span className="flex items-center justify-end gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Next
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="mt-3 block text-sm font-semibold text-foreground group-hover:text-primary">
            {next.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
