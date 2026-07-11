"use client";

import Link from "next/link";
import { ArrowRight, Command, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { getDocHref, type DocsSearchEntry } from "@/lib/docs/registry";

type DocsSearchProps = {
  docs: readonly DocsSearchEntry[];
};

export function DocsSearch({ docs }: DocsSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    const queryTerms = normalizedQuery.split(/\s+/);

    return docs
      .filter((doc) => {
        const searchableText = [
          doc.title,
          doc.description,
          doc.audience,
          ...doc.keywords,
          ...doc.headings,
          doc.content,
        ]
          .join(" ")
          .toLowerCase();
        return queryTerms.every((term) => searchableText.includes(term));
      })
      .slice(0, 6);
  }, [docs, query]);

  const hasQuery = query.trim().length > 0;

  return (
    <div className="relative max-w-xl">
      <label htmlFor="docs-search" className="sr-only">
        Search documentation
      </label>
      <div className="flex h-12 items-center gap-3 rounded-xl border border-border bg-background px-3 shadow-sm transition-shadow focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/10">
        <Search className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <input
          ref={inputRef}
          id="docs-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setQuery("");
              inputRef.current?.blur();
            }
          }}
          placeholder="Find a guide, backend, or boundary"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          autoComplete="off"
        />
        <span className="hidden items-center gap-1 rounded-md border border-border px-1.5 py-1 font-mono text-[0.62rem] text-muted-foreground sm:flex">
          <Command className="h-3 w-3" aria-hidden="true" />K
        </span>
      </div>

      {hasQuery ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl">
          {matches.length > 0 ? (
            <ul aria-label="Documentation search results" className="space-y-1">
              {matches.map((doc) => (
                <li key={doc.slug}>
                  <Link
                    href={getDocHref(doc)}
                    className="group flex items-center justify-between gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-muted"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-foreground">
                        {doc.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {doc.description}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No guide matches “{query.trim()}”. Try HAPI, approval, adapter, or MCP.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
