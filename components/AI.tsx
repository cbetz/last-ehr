import Link from "next/link";
import { ArrowRight, Braces, Check, ShieldCheck, Terminal } from "lucide-react";

const tools = [
  {
    name: "search_patients",
    detail: "Find a seeded synthetic patient by name.",
  },
  {
    name: "show_patient_info",
    detail: "Open one fixture-restricted chart by id.",
  },
];

export default function AISection() {
  return (
    <section id="mcp" className="border-b marketing-rule bg-muted/30">
      <div className="container py-20 sm:py-28">
        <div className="grid gap-8 border-b border-border pb-9 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:items-end lg:gap-16">
          <div className="max-w-xl">
            <p className="section-kicker">MCP, deliberately constrained</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.052em] sm:text-5xl sm:leading-[1.02]">
              MCP should inspect—not quietly write.
            </h2>
          </div>
          <div className="max-w-2xl lg:justify-self-end">
            <p className="text-lg leading-8 text-muted-foreground">
              The published package is Medplum-only and read-only. The
              checkout Local Lab lets a developer inspect the same bounded
              surface against four synthetic HAPI charts before connecting a
              real project.
            </p>
            <div className="mt-6 grid divide-y divide-border border-y border-border text-sm text-muted-foreground sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <p className="flex gap-2 py-3.5 sm:px-4 sm:first:pl-0">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                No FHIR credential for the Local Lab server.
              </p>
              <p className="flex gap-2 py-3.5 sm:px-4">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                Fixture-only data on loopback HAPI.
              </p>
              <p className="flex gap-2 py-3.5 sm:px-4 sm:last:pr-0">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                Your client keeps its own model account.
              </p>
            </div>
            <Link
              href="/docs/mcp"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
            >
              Read the MCP boundary
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="mt-10 min-w-0 border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              MCP access paths
            </span>
            <span className="text-primary">read-only</span>
          </div>
          <div className="grid divide-y divide-border sm:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)] sm:divide-x sm:divide-y-0">
            <div className="p-5 sm:p-6">
              <p className="font-mono text-[0.67rem] uppercase tracking-[0.13em] text-muted-foreground">Use with Medplum</p>
              <pre className="mt-5 overflow-x-auto bg-[#11152b] p-4 font-mono text-[0.81rem] leading-7 text-[#eef2ff] sm:p-5">
                <code><span className="text-[#7f91ba]">$</span> npx -y @lastehr/mcp init --client claude-code</code>
              </pre>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Prints a client registration command for a least-privilege
                Medplum token. The published package exposes only reads.
              </p>
            </div>
            <div className="p-5 sm:p-6">
              <p className="font-mono text-[0.67rem] uppercase tracking-[0.13em] text-muted-foreground">Inspect locally</p>
              <pre className="mt-5 overflow-x-auto bg-[#11152b] p-4 font-mono text-[0.81rem] leading-7 text-[#eef2ff] sm:p-5">
                <code><span className="text-[#7f91ba]">$</span> npm run mcp:demo -- --client claude-code</code>
              </pre>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Starts loopback HAPI, resets synthetic fixtures, and prints a
                direct registration command without FHIR credentials.
              </p>
            </div>
          </div>
          <div className="border-t border-border px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[0.67rem] uppercase tracking-[0.13em] text-muted-foreground">Tool manifest</p>
                <p className="mt-2 text-sm text-muted-foreground">The same two inspectable read tools, with no write flag or arbitrary endpoint.</p>
              </div>
              <div className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Published 0.1.x stays read-only.
              </div>
            </div>
            <ul className="mt-4 grid divide-y divide-border border-y border-border sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:divide-x sm:divide-y-0">
              {tools.map(({ name, detail }) => (
                <li key={name} className="py-3 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block font-mono text-xs font-medium text-foreground">{name}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
                    </span>
                    <span className="shrink-0 border border-primary/30 px-1.5 py-0.5 font-mono text-[0.6rem] text-primary">READ</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/35 px-5 py-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Braces className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Published package: <code className="font-mono text-foreground">@lastehr/mcp</code>
            </span>
            <Link href="/docs/support" className="font-medium text-foreground hover:text-primary">Support matrix →</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
