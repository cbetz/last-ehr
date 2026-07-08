/**
 * Server component that injects Organization + WebSite + SoftwareApplication
 * structured data as a single @graph. Rendered inside the root layout <body>.
 */
const BASE_URL = "https://www.lastehr.com";

export function JsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${BASE_URL}/#organization`,
        name: "Last EHR",
        url: BASE_URL,
        logo: `${BASE_URL}/icon`,
        description:
          "Last EHR is an open-source AI agent layer for Medplum and FHIR backends.",
        sameAs: ["https://x.com/lastehr"],
      },
      {
        "@type": "WebSite",
        "@id": `${BASE_URL}/#website`,
        url: BASE_URL,
        name: "Last EHR",
        publisher: { "@id": `${BASE_URL}/#organization` },
        inLanguage: "en-US",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${BASE_URL}/#software`,
        name: "Last EHR",
        applicationCategory: "HealthApplication",
        operatingSystem: "Web",
        url: BASE_URL,
        publisher: { "@id": `${BASE_URL}/#organization` },
        license: "https://www.apache.org/licenses/LICENSE-2.0",
        isAccessibleForFree: true,
        description:
          "Open-source AI agent layer that reads and writes to a FHIR backend (Medplum, or HAPI for local self-hosting) with human approval on every write. Stores no patient data of its own.",
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Neutralize XSS by escaping the closing-angle bracket, per Next.js guidance.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
      }}
    />
  );
}
