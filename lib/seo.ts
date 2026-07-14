import type { Metadata } from "next";

const SITE_URL = "https://www.lastehr.com";

// Mirrors the alt/size/contentType exported by app/opengraph-image.tsx (which
// app/twitter-image.tsx re-exports). Declared here rather than imported so
// lib code never pulls in the next/og image renderer.
const CARD_IMAGE = {
  width: 1200,
  height: 630,
  alt: "Last EHR: Human-approved AI writeback for FHIR",
} as const;

// Builds a subpage's canonical/openGraph/twitter metadata in one place so the
// two card systems cannot drift. Next.js merges metadata shallowly: a page
// that sets openGraph replaces the root layout's whole openGraph object but
// still inherits the root twitter block, so a page without its own twitter
// metadata shows the generic homepage copy on X. The images are declared in
// object form with explicit dimensions because the file-based
// app/opengraph-image.tsx and app/twitter-image.tsx do not survive a
// page-level openGraph/twitter override, and a bare-string images entry would
// drop the width/height/alt some scrapers need for a large-image card.
export function pageMetadata({
  title,
  description,
  path,
  cardTitle,
  cardDescription,
  type = "article",
  keywords,
}: {
  /** Page <title>; the root template appends "| Last EHR". */
  title: string;
  description: string;
  /** Site-relative path, e.g. "/headless-ehr". */
  path: string;
  /** Social-card title. Rendered literally (no template); defaults to title. */
  cardTitle?: string;
  /** Social-card description; defaults to description. */
  cardDescription?: string;
  type?: "article" | "website";
  keywords?: string[];
}): Metadata {
  return {
    title,
    description,
    keywords,
    alternates: { canonical: path },
    openGraph: {
      type,
      siteName: "Last EHR",
      locale: "en_US",
      title: cardTitle ?? title,
      description: cardDescription ?? description,
      url: `${SITE_URL}${path}`,
      images: [
        { url: `${SITE_URL}/opengraph-image`, type: "image/png", ...CARD_IMAGE },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: "@lastehr",
      creator: "@lastehr",
      title: cardTitle ?? title,
      description: cardDescription ?? description,
      images: [{ url: `${SITE_URL}/twitter-image`, ...CARD_IMAGE }],
    },
  };
}
