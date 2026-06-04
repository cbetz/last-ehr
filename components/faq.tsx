export interface FaqItem {
  q: string;
  a: string;
}

/**
 * Renders an accessible FAQ (native <details>) plus matching FAQPage JSON-LD
 * from the same data, so the structured data never drifts from the visible
 * content. Server component.
 */
export function Faq({
  items,
  heading = "Frequently asked questions",
}: {
  items: FaqItem[];
  heading?: string;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <section className="container py-16 sm:py-24">
      <h2 className="mb-10 text-center text-3xl font-bold md:text-4xl">
        {heading}
      </h2>
      <div className="mx-auto max-w-3xl divide-y rounded-lg border">
        {items.map((item) => (
          <details key={item.q} className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {item.q}
              <span
                aria-hidden="true"
                className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              {item.a}
            </p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </section>
  );
}
