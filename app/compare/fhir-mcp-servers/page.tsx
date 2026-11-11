import type { Metadata } from "next";
import Link from "next/link";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";
import { pageMetadata } from "@/lib/seo";
import {
  FHIR_MCP_COMPARISON_CHECKED_ON,
  FHIR_MCP_COMPARISON_PATH,
  fhirMcpComparisonJsonLd,
  fhirMcpServers,
} from "@/lib/compare/fhir-mcp-servers";

export const metadata: Metadata = pageMetadata({
  title: "FHIR MCP servers compared",
  description:
    "Alphabetical comparison of open-source FHIR MCP servers: language, FHIR backends, reads, writes, human approval, license, and last commit. Checked on 2026-11-11.",
  path: FHIR_MCP_COMPARISON_PATH,
  keywords: [
    "FHIR MCP server",
    "FHIR MCP servers",
    "MCP FHIR",
    "FHIR MCP servers compared",
    "Last EHR",
  ],
});

const columns = [
  "Language",
  "FHIR backends",
  "Read coverage",
  "Write support",
  "Writes require human approval",
  "License",
  "Last commit",
] as const;

export default function FhirMcpServersPage() {
  const jsonLd = JSON.stringify(fhirMcpComparisonJsonLd()).replace(/</g, "\\u003c");

  return (
    <>
      <Navbar />
      <main>
        <article className="container py-16 sm:py-24">
          <header className="max-w-3xl">
            <p className="section-kicker">Comparison</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              FHIR MCP servers compared
            </h1>
            <p className="mt-6 text-xl leading-8 text-muted-foreground">
              Open-source MCP servers whose public docs describe access to a
              FHIR API. Last EHR is one row in this table.
            </p>
            <p className="mt-4 leading-7 text-muted-foreground">
              A FHIR MCP server exposes tools an MCP client, such as Claude or
              Cursor, can call against a FHIR backend. The columns are the
              language, the backends the project documents, what those docs say
              it can read, whether it can write, whether a person must approve
              each write, the license, and the latest commit on the default branch.
            </p>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Checked on{" "}
              <time dateTime={FHIR_MCP_COMPARISON_CHECKED_ON}>
                {FHIR_MCP_COMPARISON_CHECKED_ON}
              </time>
              . Rows are alphabetical. This is not a ranking, and it is not a
              clinical, safety, or compliance claim. Last commit is the
              committer date of the default-branch HEAD from the GitHub API. A
              package version, when shown, is the npm or PyPI version returned
              the same day. Those are different facts. &quot;Not described&quot;
              means the linked README does not describe that behavior.
            </p>
          </header>

          <div className="mt-10 overflow-x-auto border border-border">
            <table className="w-full min-w-[68rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                FHIR MCP servers compared, checked on {FHIR_MCP_COMPARISON_CHECKED_ON}
              </caption>
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="border-b border-border px-3 py-3 font-semibold">
                    Name
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="border-b border-border px-3 py-3 font-semibold"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fhirMcpServers.map((server) => (
                  <tr key={server.href} className="align-top">
                    <th scope="row" className="border-b border-border px-3 py-4 font-semibold">
                      <a
                        href={server.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-border underline-offset-4 hover:decoration-foreground"
                      >
                        {server.name}
                      </a>
                      {server.packageHref && server.packageLabel ? (
                        <a
                          href={server.packageHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 block text-xs font-normal text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
                        >
                          {server.packageLabel}
                        </a>
                      ) : null}
                      {server.name === "Last EHR" ? (
                        <span className="mt-2 block text-xs font-normal text-muted-foreground">
                          This site&apos;s MCP server
                        </span>
                      ) : null}
                    </th>
                    <td className="border-b border-border px-3 py-4">{server.language}</td>
                    <td className="border-b border-border px-3 py-4 leading-6 text-muted-foreground">
                      {server.backends}
                    </td>
                    <td className="border-b border-border px-3 py-4 leading-6 text-muted-foreground">
                      {server.reads}
                    </td>
                    <td className="border-b border-border px-3 py-4 leading-6 text-muted-foreground">
                      {server.writes}
                    </td>
                    <td className="border-b border-border px-3 py-4 leading-6 text-muted-foreground">
                      {server.humanApproval}
                    </td>
                    <td className="border-b border-border px-3 py-4 leading-6">{server.license}</td>
                    <td className="border-b border-border px-3 py-4 whitespace-nowrap">
                      <a
                        href={server.lastCommitHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-border underline-offset-4 hover:decoration-foreground"
                      >
                        <time dateTime={server.lastCommit}>{server.lastCommit}</time>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="mt-14 max-w-3xl border-t border-border pt-8">
            <h2 className="text-2xl font-semibold tracking-tight">Sources</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Each link below was requested on {FHIR_MCP_COMPARISON_CHECKED_ON}.
              The table uses the README or guide at that URL, plus the GitHub
              repository API for license metadata and the default-branch commit
              date. Package links were checked against the public npm registry
              or the PyPI JSON API.
            </p>
            <ul className="mt-6 space-y-5">
              {fhirMcpServers.map((server) => (
                <li key={server.href}>
                  <p className="font-medium">{server.name}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
                    {server.sources.map((source) => (
                      <li key={source.href}>
                        <a
                          href={source.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-border underline-offset-4 hover:text-foreground"
                        >
                          {source.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-12 max-w-3xl border-t border-border pt-8">
            <h2 className="text-2xl font-semibold tracking-tight">Connect an agent</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Questions about pointing Claude or Cursor at a FHIR server, Epic
              sandbox writes, human approval, and synthetic data are on the{" "}
              <Link href="/#faq" className="text-foreground underline underline-offset-4">
                homepage FAQ
              </Link>
              . The Last EHR MCP guide is at{" "}
              <Link href="/docs/mcp" className="text-foreground underline underline-offset-4">
                /docs/mcp
              </Link>
              .
            </p>
          </section>
        </article>
      </main>
      <SiteFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
    </>
  );
}
