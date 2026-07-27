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
          "Last EHR is the agent layer for a headless FHIR EHR. It reads the chart broadly (25 of US Core 9.0.0's 27 readable resource types across 23 sections, following references), is built so the agent cannot report an absence it never checked for, and turns every write into a reviewable proposal a person approves (Proposal, Decision, Commit, Audit). Five FHIR backends behind one interface, with web and MCP bindings and an independent conformance suite.",
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
          "The agent layer between an AI agent and a headless FHIR EHR: broad patient-scoped chart reads (25 of US Core's 27 readable resource types, reference following, measurement names resolved to LOINC), read results engineered so an agent cannot state an absence it never checked for, and a human approval gate on every write per the Approval-Gated Agent Writes on FHIR protocol (v0.1 draft). Five verified backends including Medplum, plus an MCP package (read-only by default, opt-in elicitation-gated writes), a standalone conformance suite, and a synthetic workflow evaluator against local HAPI. Stores no patient data of its own.",
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
