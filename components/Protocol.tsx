import Link from "next/link";
import { ArrowRight, GitBranch, MonitorCheck, TerminalSquare } from "lucide-react";

const bindings = [
  {
    icon: MonitorCheck,
    name: "Web approval card",
    detail:
      "The write tool declares needsApproval; the SDK pauses before execute; a card renders the exact fields plus a FHIR-shaped preview; an explicit approve or cancel resumes the flow.",
    href: "/demo",
    cta: "See it live in the demo",
  },
  {
    icon: TerminalSquare,
    name: "MCP elicitation",
    detail:
      "A host that cannot render the approval prompt is never offered a write tool. Each call pauses on an elicitation showing the exact fields with one approve boolean; only an explicit approval commits.",
    href: "/docs/mcp",
    cta: "Read the MCP binding",
  },
];

const conformanceChecks = [
  "Capability gate: no approval surface, no write tools",
  "Proposal before persistence, probed during deliberation",
  "Approve, decline, cancel, and transport failure — every non-approval saves nothing",
  "Commit fidelity: the reviewed values committed, exactly once",
  "Audit: AIAST labels and author/verifier Provenance (strict mode)",
];

export function ProtocolSection() {
  return (
    <section id="protocol" className="border-b marketing-rule">
      <div className="container py-20 sm:py-28">
        <div className="grid gap-8 border-b border-border pb-9 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:items-end lg:gap-16">
          <div className="max-w-xl">
            <p className="section-kicker inline-flex items-center gap-2">
              <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
              One protocol, two running bindings
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.052em] sm:text-5xl sm:leading-[1.02]">
              Not designed on paper. Extracted from running code.
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground lg:justify-self-end">
            Approval-Gated Agent Writes on FHIR is a v0.1 draft of the layer
            between “the agent wants to write” and “the chart changed”:
            Proposal → Decision → Commit → Audit. CDS Hooks owns EHR-initiated
            suggestions, the AI Transparency IG owns after-the-fact
            provenance, SMART owns identity, MCP owns transport — this names
            the unclaimed step in the middle, reusing their vocabulary where
            it fits. Independent implementations and criticism are invited.
          </p>
        </div>

        <div className="mt-10 grid divide-y divide-border border-b border-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          {bindings.map(({ icon: Icon, name, detail, href, cta }) => (
            <article key={name} className="flex flex-col py-7 lg:px-8 lg:py-9 first:lg:pl-0 last:lg:pr-0">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-xl font-semibold tracking-[-0.03em]">{name}</h3>
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p>
              <p className="mt-4 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-primary">
                Same semantics, different host
              </p>
              <Link
                href={href}
                className="mt-auto pt-6 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
              >
                {cta}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="max-w-xl">
            <h3 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
              A safety claim you can test from outside.
            </h3>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              The conformance suite is an independent MCP client with a
              scripted reviewer. It spawns an implementing server fresh for
              every scenario and verifies each outcome against the FHIR store
              with its own reads — never the implementation&apos;s word for
              it. CI runs it in strict mode against this repository&apos;s own
              server on every pull request and merge.
            </p>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              It proves gate mechanics, not clinical correctness or
              authorization — the report says exactly which is which.
            </p>
            <Link
              href="/docs/conformance"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
            >
              Run it against your implementation
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="min-w-0 border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
              <span>Test the claim</span>
              <span className="text-primary">strict mode in CI</span>
            </div>
            <pre className="overflow-x-auto bg-[#11152b] p-4 font-mono text-[0.78rem] leading-7 text-[#eef2ff] sm:p-5">
              <code>
                <span className="text-[#7f91ba]">$</span> npx @lastehr/agent-write-conformance \{"\n"}
                {"    "}--server &quot;node dist/my-mcp-server.js&quot; \{"\n"}
                {"    "}--manifest awp-manifest.json \{"\n"}
                {"    "}--fhir-base-url http://localhost:8080/fhir \{"\n"}
                {"    "}--confirm-synthetic --strict
              </code>
            </pre>
            <ul className="divide-y divide-border">
              {conformanceChecks.map((check) => (
                <li key={check} className="px-4 py-3 text-sm leading-6 text-muted-foreground sm:px-5">
                  {check}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
