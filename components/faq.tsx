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
  id = "faq",
}: {
  items: FaqItem[];
  heading?: string;
  id?: string;
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
    <section id={id} className="border-b marketing-rule">
      <div className="container py-16 sm:py-20">
        <p className="section-kicker">FAQ</p>
        <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
          {heading}
        </h2>
        <div className="mt-8 max-w-3xl divide-y divide-border border-y border-border">
          {items.map((item) => (
            <details key={item.q} className="group py-5">
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
