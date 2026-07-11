import Link from "next/link";

import {
  docsGroups,
  getDocHref,
  getDocsByGroup,
  type DocsRegistryEntry,
} from "@/lib/docs/registry";

type DocsSidebarProps = {
  activeSlug?: string;
  label?: string;
};

export function DocsSidebar({
  activeSlug,
  label = "Documentation navigation",
}: DocsSidebarProps) {
  return (
    <nav aria-label={label}>
      {docsGroups.map((group, groupIndex) => (
        <div key={group} className={groupIndex === 0 ? "" : "mt-7"}>
          <p className="px-3 text-[0.66rem] font-semibold uppercase tracking-[0.15em] text-primary">
            {group}
          </p>
          <ul className="mt-2 space-y-1">
            {getDocsByGroup(group).map((doc: DocsRegistryEntry) => {
              const active = doc.slug === activeSlug;
              return (
                <li key={doc.slug}>
                  <Link
                    href={getDocHref(doc)}
                    aria-current={active ? "page" : undefined}
                    className={`-ml-px block border-l-2 px-3 py-2 text-sm leading-5 transition-colors ${
                      active
                        ? "border-primary bg-muted font-semibold text-foreground"
                        : "border-transparent text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {doc.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
