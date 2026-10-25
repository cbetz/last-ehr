import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { READ_TOOL_COUNT } from "@/lib/coverage";

export default function AISection() {
  return (
    <section id="mcp" className="border-b marketing-rule">
      <div className="container py-16 sm:py-20">
        <p className="section-kicker">Use it</p>
        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
          Use Last in the browser or with your own assistant.
        </h2>
        <div className="mt-9 grid grid-cols-[minmax(0,1fr)] divide-y divide-border border-y border-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <article className="min-w-0 py-7 lg:pr-7">
            <h3 className="text-xl font-semibold">Web app</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A chat interface with patient cards and write previews. Sign in
              with Medplum or launch from a patient’s chart through SMART on FHIR.
              Bring your own backend and model credentials.
            </p>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              To inspect the approval flow first, the local HAPI walkthrough
              uses synthetic data and needs no model API key.
            </p>
            <Link href="/docs/quickstart" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold hover:text-primary">
              Set up the web app
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>
          <article className="min-w-0 py-7 lg:px-7">
            <h3 className="text-xl font-semibold">Chart MCP package</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Give Claude Code, Cursor, or another MCP client the same
              {" "}{READ_TOOL_COUNT} chart-reading tools. The package is
              read-only by default. Enable writes separately; each proposal
              requires a client that supports human approval prompts.
            </p>
            <pre className="mt-5 overflow-x-auto border border-border bg-muted/30 p-4 font-mono text-xs leading-6">
              <code>npx -y @lastehr/mcp init --client claude-code</code>
            </pre>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Supports Medplum and this repo’s local synthetic HAPI stack.
            </p>
            <Link href="/docs/mcp" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold hover:text-primary">
              Configure MCP
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>
          <article className="min-w-0 py-7 lg:pl-7">
            <h3 className="text-xl font-semibold">Assistant Work</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Let an external assistant draft a follow-up from a synthetic
              chart. You review the exact proposal in Last’s inbox. After
              approval, Last saves the Task and verifies the result; the
              assistant can check the receipt.
            </p>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Tested with the Grok Bot desktop app over HTTPS MCP and OAuth.
              Self-host the synthetic lab or arrange access with the pilot
              operator. There is no public self-service enrollment yet.
            </p>
            <Link href="/docs/grok-bot" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold hover:text-primary">
              Connect Grok Bot
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
