"use client";

import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown for assistant prose in the demo chat, deliberately narrower than
 * the docs renderer.
 *
 * The model emits markdown whether or not anything renders it: before this,
 * a chart summary showed the reader literal `**asterisks**` and pipe-delimited
 * table rows. But assistant prose is not trusted content the way a docs page
 * is. Chart free text reaches the model as data, and the model can echo it, so
 * anything a document or note could smuggle into that prose must be inert
 * here:
 *
 * - **No raw HTML.** `rehype-raw` is deliberately absent, so markup in the
 *   stream stays text. This is also what keeps the `<chart_text>` boundary
 *   visible as characters rather than becoming an element.
 * - **No clickable links.** A link whose text and target disagree is the
 *   oldest trick there is, and a clinician clicking one from a chart summary
 *   is exactly the outcome to avoid. Link text renders; the href is dropped.
 * - **No images.** An image URL is an outbound request the reader never
 *   authorized, and a tracking pixel addressed by patient id is a leak.
 * - **No headings as headings.** A bubble is not a document; a model that
 *   opens with `# Summary` should not restyle the page.
 */
const components: Components = {
  // Tight vertical rhythm: bubbles are short, and prose spacing would fight
  // the surrounding chat layout.
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-7">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-6">{children}</li>,
  code: ({ children }) => (
    <code className="border border-border bg-muted/40 px-1 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    // Wide content scrolls inside its own box; the page must never scroll.
    <pre className="mb-2 max-w-full overflow-x-auto border border-border bg-muted/30 p-3 font-mono text-xs leading-6 last:mb-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted-foreground last:mb-0">
      {children}
    </blockquote>
  ),
  // A model summarizing a chart reaches for a table constantly, and the raw
  // pipes were the worst of the unrendered output.
  table: ({ children }) => (
    <div className="mb-2 max-w-full overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border px-2 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border px-2 py-1.5 align-top last:border-b-0">
      {children}
    </td>
  ),
  hr: () => <hr className="my-3 border-border" />,
  // Headings flatten to emphasis: keep the author's structure, drop the scale.
  h1: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
  h2: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
  h3: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
  h4: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
  h5: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
  h6: ({ children }) => <p className="mb-2 font-semibold last:mb-0">{children}</p>,
  // Text without the href. Not styled as a link either: something that looks
  // clickable and is not is its own small betrayal.
  a: ({ children }) => <>{children}</>,
  img: () => null,
};

export function AssistantMarkdown({ children }: { children: string }): ReactNode {
  return (
    <div className="max-w-full">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
