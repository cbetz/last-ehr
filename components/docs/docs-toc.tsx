import type { DocsHeading } from "@/lib/docs/registry";

type DocsTocProps = {
  headings: DocsHeading[];
  label?: string;
};

export function DocsToc({ headings, label = "On this page" }: DocsTocProps) {
  if (headings.length === 0) {
    return null;
  }

  return (
    <nav aria-label={label}>
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.15em] text-primary">
        {label}
      </p>
      <ol className="mt-3 space-y-2 border-l border-border">
        {headings.map((heading) => (
          <li key={heading.id} className={heading.level === 3 ? "ml-3" : ""}>
            <a
              href={`#${heading.id}`}
              className="-ml-px block border-l border-transparent py-0.5 pl-3 text-sm leading-5 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
