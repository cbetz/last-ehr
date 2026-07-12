import type { ReactNode } from "react";
import { isValidElement } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "@/components/docs/code-block";
import { MermaidDiagram } from "@/components/docs/mermaid-diagram";
import { resolveDocHref } from "@/lib/docs/links";
import {
  createHeadingIdGenerator,
  type DocsRegistryEntry,
} from "@/lib/docs/registry";

type MarkdownContentProps = {
  markdown: string;
  doc: DocsRegistryEntry;
};

function getText(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(getText).join("");
  }

  if (isValidElement(value)) {
    return getText((value.props as { children?: ReactNode }).children);
  }

  return "";
}

function getLanguage(className?: string) {
  return className?.match(/language-([^\s]+)/)?.[1];
}

function withoutMarkdownNode<T extends { node?: unknown }>(props: T): Omit<T, "node"> {
  const { node, ...elementProps } = props;
  void node;
  return elementProps;
}

export function MarkdownContent({ markdown, doc }: MarkdownContentProps) {
  const nextHeadingId = createHeadingIdGenerator();
  const components: Components = {
    h2: ({ children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      return (
        <h2
          id={nextHeadingId(getText(children))}
          className="scroll-mt-28 mt-14 text-2xl font-semibold tracking-[-0.035em] text-foreground first:mt-0 sm:text-3xl"
          {...elementProps}
        >
          {children}
        </h2>
      );
    },
    h3: ({ children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      return (
        <h3
          id={nextHeadingId(getText(children))}
          className="scroll-mt-28 mt-10 text-xl font-semibold tracking-[-0.025em] text-foreground sm:text-2xl"
          {...elementProps}
        >
          {children}
        </h3>
      );
    },
    p: ({ children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      return (
        <p className="mt-5 text-[1rem] leading-8 text-muted-foreground" {...elementProps}>
          {children}
        </p>
      );
    },
    a: ({ href, children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      const destination = href ? resolveDocHref(href, doc) : undefined;
      const external = destination ? /^[a-z][a-z0-9+.-]*:/i.test(destination) : false;
      const className = "font-medium text-foreground underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary";

      if (!destination) {
        return <span {...elementProps}>{children}</span>;
      }

      if (external) {
        return (
          <a
            href={destination}
            target="_blank"
            rel="noopener noreferrer"
            className={className}
            {...elementProps}
          >
            {children}
          </a>
        );
      }

      if (destination.startsWith("#")) {
        return (
          <a href={destination} className={className} {...elementProps}>
            {children}
          </a>
        );
      }

      return (
        <Link href={destination} className={className} {...elementProps}>
          {children}
        </Link>
      );
    },
    ul: ({ children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      return (
        <ul className="mt-5 space-y-3 pl-6 text-[1rem] leading-8 text-muted-foreground marker:text-primary" {...elementProps}>
          {children}
        </ul>
      );
    },
    ol: ({ children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      return (
        <ol className="mt-5 space-y-3 pl-6 text-[1rem] leading-8 text-muted-foreground marker:font-semibold marker:text-primary" {...elementProps}>
          {children}
        </ol>
      );
    },
    li: ({ children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      return <li className="pl-1 [&>p]:mt-0" {...elementProps}>{children}</li>;
    },
    strong: ({ children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      return <strong className="font-semibold text-foreground" {...elementProps}>{children}</strong>;
    },
    blockquote: ({ children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      return (
        <blockquote className="my-6 border-l-2 border-primary pl-5 text-[1rem] italic leading-8 text-muted-foreground" {...elementProps}>
          {children}
        </blockquote>
      );
    },
    hr: (props) => {
      const elementProps = withoutMarkdownNode(props);
      return <hr className="my-10 border-border" {...elementProps} />;
    },
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      const language = getLanguage(className);
      const code = getText(children).replace(/\n$/, "");

      if (language === "mermaid") {
        return <MermaidDiagram code={code} />;
      }

      if (language) {
        return <CodeBlock code={code} language={language} />;
      }

      return (
        <code
          className="border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[0.84em] font-medium text-foreground"
          {...elementProps}
        >
          {children}
        </code>
      );
    },
    table: ({ children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      return (
        <div className="my-6 overflow-x-auto border border-border">
          <table className="min-w-full border-collapse text-left text-sm" {...elementProps}>
            {children}
          </table>
        </div>
      );
    },
    thead: ({ children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      return <thead className="bg-muted/60 text-foreground" {...elementProps}>{children}</thead>;
    },
    th: ({ children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      return <th className="min-w-36 border-b border-border px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]" {...elementProps}>{children}</th>;
    },
    td: ({ children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      return <td className="min-w-36 border-b border-border px-4 py-3 align-top leading-6 text-muted-foreground last:border-b-0" {...elementProps}>{children}</td>;
    },
    tr: ({ children, ...props }) => {
      const elementProps = withoutMarkdownNode(props);
      return <tr className="bg-card last:[&>td]:border-b-0" {...elementProps}>{children}</tr>;
    },
  };

  return (
    <div className="docs-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
