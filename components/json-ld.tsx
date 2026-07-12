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
          "Last EHR adds human-approved AI writeback to FHIR apps: open-source infrastructure for approval-gated agents and bounded clinical context, where a person approves every write.",
        sameAs: ["https://github.com/cbetz/last-ehr", "https://x.com/lastehr"],
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
          "Adds human-approved AI writeback to FHIR apps: bounded chart reads, structured write proposals, and a human approval gate on every write. Supports Medplum, with a read-only MCP Local Lab and a synthetic workflow evaluator against local HAPI. Stores no patient data of its own.",
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
