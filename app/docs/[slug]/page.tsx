import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowUpRight, ChevronRight, FileText, Rocket } from "lucide-react";

import { DocsNavigation } from "@/components/docs/docs-navigation";
import { DocsSearch } from "@/components/docs/docs-search";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { DocsToc } from "@/components/docs/docs-toc";
import { MarkdownContent } from "@/components/docs/markdown-content";
import { buttonVariants } from "@/components/ui/button";
import {
  getDocMarkdown,
  getDocsSearchIndex,
  getMarkdownBody,
} from "@/lib/docs/content";
import {
  docsRegistry,
  extractHeadings,
  getDoc,
  getSourceHref,
} from "@/lib/docs/registry";

type DocsPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return docsRegistry.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDoc(slug);

  if (!doc) {
    return {};
  }

  const url = `/docs/${doc.slug}`;

  return {
    title: doc.title,
    description: doc.description,
    keywords: [...doc.keywords],
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: `${doc.title} | Last EHR Docs`,
      description: doc.description,
      url,
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: `${doc.title} | Last EHR Docs`,
      description: doc.description,
    },
  };
}

export default async function DocsArticlePage({ params }: DocsPageProps) {
  const { slug } = await params;
  const doc = getDoc(slug);

  if (!doc) {
    notFound();
  }

  const [markdown, searchIndex] = await Promise.all([
    getDocMarkdown(doc),
    getDocsSearchIndex(),
  ]);
  const headings = extractHeadings(markdown);
  const body = getMarkdownBody(markdown);
  const quickstartHref = "/docs/quickstart#zero-key-local-synthetic-demo-with-hapi-fhir";

  return (
    <main>
      <section className="border-b border-border/70 bg-[radial-gradient(circle_at_82%_0%,hsl(var(--primary)/0.12),transparent_24rem)]">
        <div className="container py-10 sm:py-14">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link href="/docs" className="transition-colors hover:text-foreground">
              Docs
            </Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{doc.group}</span>
          </div>
          <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
            <div className="max-w-3xl">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">
                {doc.audience}
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em] text-balance sm:text-5xl sm:leading-[0.98]">
                {doc.title}
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                {doc.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link
                href={quickstartHref}
                className={buttonVariants({
                  variant: "outline",
                  size: "sm",
                  className: "rounded-md",
                })}
              >
                <Rocket className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Run locally
              </Link>
              <Link
                href={getSourceHref(doc)}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({
                  variant: "ghost",
                  size: "sm",
                  className: "rounded-md",
                })}
              >
                <FileText className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Markdown source
                <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="mt-8 max-w-xl">
            <DocsSearch docs={searchIndex} />
          </div>

          <div className="mt-7 grid gap-3 lg:hidden">
            <details className="rounded-lg border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                Browse documentation
              </summary>
              <div className="mt-5">
                <DocsSidebar activeSlug={doc.slug} label="Mobile documentation navigation" />
              </div>
            </details>
            <details className="rounded-lg border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                On this page
              </summary>
              <div className="mt-5">
                <DocsToc headings={headings} label="Mobile table of contents" />
              </div>
            </details>
          </div>
        </div>
      </section>

      <div className="container grid gap-10 py-10 lg:grid-cols-[13rem_minmax(0,46rem)] lg:justify-center lg:py-14 xl:grid-cols-[13rem_minmax(0,46rem)_12rem] xl:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <DocsSidebar activeSlug={doc.slug} />
          </div>
        </aside>

        <article className="min-w-0">
          <div className="rounded-lg border border-border bg-muted/25 px-4 py-3 text-sm leading-6 text-muted-foreground">
            This guide describes the reference implementation as it exists today. Keep the
            stated support boundary in view as you evaluate or extend it.
          </div>
          <MarkdownContent markdown={body} doc={doc} />
          <div className="mt-10 rounded-lg border border-primary/20 bg-primary/[0.06] p-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
            <div>
              <p className="font-semibold text-foreground">Want a concrete starting point?</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Run the limited synthetic HAPI walkthrough before connecting a real backend.
              </p>
            </div>
            <Link
              href={quickstartHref}
              className="mt-4 inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary sm:mt-0"
            >
              Open quickstart
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <DocsNavigation doc={doc} />
        </article>

        <aside className="hidden xl:block">
          <div className="sticky top-28">
            <DocsToc headings={headings} />
          </div>
        </aside>
      </div>
    </main>
  );
}
