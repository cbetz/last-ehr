import type { Metadata } from "next";

import { pageMetadata } from "@/lib/seo";
import Link from "next/link";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";
import { Faq, type FaqItem } from "@/components/faq";
import { IconGitHub } from "@/components/ui/icons";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = pageMetadata({
  title: "Medplum AI Agent: Add AI Chat to Your Patient Chart",
  description:
    "Add an open-source, approval-gated AI agent to Medplum. Search patients, read charts, and write notes and observations with human approval.",
  keywords: [
    "Medplum AI agent",
    "add AI to Medplum",
    "Medplum AI chat",
    "Medplum LLM integration",
    "FHIR AI agent",
  ],
  path: "/medplum-ai-agent",
  cardDescription:
    "Add an open-source, approval-gated AI agent to Medplum. Reads the chart, proposes writes, and saves nothing without your approval.",
});

const faqs: FaqItem[] = [
  {
    q: "Is Last EHR a replacement for Medplum?",
    a: "No. Last EHR is a layer that runs on top of Medplum. Medplum is the system of record: it stores the patient data, handles authentication, manages access control, and logs audit trails. Last EHR is a chat interface that reads from and writes to Medplum. It is not a backend, not a replacement, and not the source of truth.",
  },
  {
    q: "What does the approval gate do, and what does it not do?",
    a: "The approval gate is a write-safety control: it surfaces proposed writes to the user and requires an explicit click before anything is saved. It stops unilateral writes and creates a human-in-the-loop checkpoint. What it does not do is enforce access control (that is Medplum's AccessPolicy), or guarantee clinical correctness (that is the clinician's responsibility). The gate stops the agent from writing without your click; it does not stop you from approving a clinically wrong write.",
  },
  {
    q: "Can I use Last EHR with real patient data today?",
    a: "You should not. Last EHR is alpha software, and using it with real PHI requires a BAA with your model provider and a HIPAA-eligible backend with its own BAA. Use synthetic data for development, testing, and evaluation. Only consider real data once you have the agreements in place and have done your own compliance review.",
  },
  {
    q: "Can I add more tools to the agent?",
    a: "Yes. The tools are defined in lib/ai/tools.ts. You can add new tools by following the Vercel AI SDK tool pattern and writing new FHIR calls. The code is Apache-2.0, so you can fork it and extend it for your use case.",
  },
  {
    q: "Does Last EHR work with backends other than Medplum?",
    a: "Medplum (hosted or self-hosted) is the supported authenticated path. For synthetic evaluation only, three more adapters ship in the repository: local HAPI FHIR, Firely Server, and Aidbox, each verified with the shared contract tests and the FHIR Agent Safety Eval; none is a PHI-ready deployment path. Oystehr and other targets still need an adapter with a documented auth story and the same evidence before they are called supported.",
  },
  {
    q: "What model providers does Last EHR support?",
    a: "OpenAI, Anthropic, and Amazon Bedrock are supported out of the box. Set AI_PROVIDER, MODEL_ID when needed, and the matching provider credentials. The project intentionally ships BAA-capable provider paths only.",
  },
  {
    q: "Can I use the tools from Claude Desktop or another MCP client?",
    a: "Yes. @lastehr/mcp is an installable stdio server for Medplum. By default it exposes exactly two chart-reading tools, search_patients and show_patient_info. Writes exist only behind an explicit opt-in (LASTEHR_MCP_WRITES=proposal) where the client shows the exact proposed fields and a human approves each action. Read access can still return PHI, so use a least-privilege Medplum identity and review the MCP host's data handling.",
  },
];

export default function MedplumAiAgentPage() {
  return (
    <>
      <Navbar />
      <main>
        <article>
          <section className="container max-w-3xl py-16 sm:py-24">
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">
              Add an AI agent to Medplum: approval-gated chat over the patient
              chart
            </h1>
            <p className="mt-6 text-xl text-muted-foreground">
              Medplum gives you a FHIR backend and APIs to build on. Last EHR
              adds an AI agent layer: a chat interface that reads your patient
              chart and proposes writes (notes, observations) that require your
              approval before saving. It is open source, self-hosted, and brings
              your own model key.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/demo" className={buttonVariants()}>
                Try the live demo
              </Link>
              <Link
                href="https://github.com/cbetz/last-ehr"
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                <IconGitHub className="mr-2 h-4 w-4" aria-hidden="true" />
                View on GitHub
              </Link>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              What Last EHR adds to a Medplum project
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                Medplum is a headless FHIR backend. It handles authentication,
                multi-tenancy, access control, and audit logs. What it does not
                give you out of the box is a chat interface for working the
                chart in natural language.
              </p>
              <p>
                Last EHR is a thin agent layer that runs on top of Medplum and
                adds that interface. The agent has four tools:
              </p>
              <ol className="list-decimal space-y-2 pl-6">
                <li>Search patients by name</li>
                <li>
                  View a patient&apos;s chart (conditions, allergies,
                  medications, observations, notes, immunizations)
                </li>
                <li>Add a free-text note (approval-gated)</li>
                <li>
                  Record an observation: a vital sign or lab value with a
                  numeric value and unit (approval-gated)
                </li>
              </ol>
              <p>
                Reads execute immediately, so you see patient data in the chat.
                Writes trigger a confirmation card in the UI: nothing touches
                your chart until you click Approve. Once approved, the write
                goes to Medplum under the signed-in user&apos;s identity,
                bounded by your AccessPolicy.
              </p>
              <p>
                The layer stores no patient data of its own. Every API call
                runs against your Medplum instance, using the credentials you
                provide.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              Not the Medplum Agent: how this differs from Medplum&apos;s own
              tools
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                Medplum has its own tools with similar-sounding names, so it is
                worth being precise about what Last EHR is and is not.
              </p>
              <p>
                The <strong className="text-foreground">Medplum Agent</strong>{" "}
                is Medplum&apos;s on-premise connectivity tool: it bridges
                devices and legacy feeds (HL7 v2, DICOM) on a local network to
                your Medplum project. It is integration plumbing, not a chat
                interface. The name collides; the products do not.
              </p>
              <p>
                Medplum also ships an{" "}
                <strong className="text-foreground">MCP server</strong> that
                exposes Medplum data to MCP-compatible clients such as Claude.
                That is lower-level infrastructure for wiring models to data;
                it does not include a clinician-facing UI or an approval gate.
                Last EHR ships a separate MCP package, read-only by default, for two
                bounded chart-reading tools; the difference in scope is
                covered below.
              </p>
              <p>
                And Medplum now has{" "}
                <strong className="text-foreground">Spaces</strong>, an in-app
                AI assistant in Medplum Provider, shipped as an{" "}
                <Link
                  href="https://www.medplum.com/docs/provider/spaces"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  example implementation
                </Link>
                . A chain of bots translates a question into FHIR calls, the
                Provider UI executes them under the signed-in user&apos;s
                AccessPolicy, and summary and visualizer bots narrate the
                results and render charts. It is a capable assistant with a
                real access model: every call runs as the signed-in user, the
                same posture Last EHR takes.
              </p>
              <p>
                The write model is where the two part ways. Spaces executes
                writes as soon as its loop reaches them; its own docs advise
                reviewing the resulting resources and scoping the ai feature
                to AccessPolicies without write access to high-risk types.
                That control is policy scoping at the account level. Last EHR
                puts a human approval in front of each individual write
                instead. Neither is a superset of the other: policy scoping
                bounds what the assistant can ever touch, a per-write gate
                makes each change an explicit human decision. Beyond the
                gate, the practical differences are setup and portability:
                Spaces runs one vendor&apos;s models (OpenAI, via a project
                secret) inside Medplum Provider and requires the gated ai and
                bots project features plus deploying three bots and authoring
                their prompts; Last EHR is a standalone app you run yourself,
                with OpenAI, Anthropic, or Amazon Bedrock.
              </p>
              <p>
                Medplum continues to ship its own AI features on its own
                roadmap; this project is independent of that and focuses on
                one interaction done carefully: approval-gated chat over the
                chart.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              How approval-gated writes work with your AccessPolicy
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                The approval gate is a UI control, not a permission control.
                When you approve a write, it still goes through Medplum&apos;s
                AccessPolicy. If your policy says the signed-in user cannot
                create Communications or Observations, Medplum rejects the
                write even after approval.
              </p>
              <ol className="list-decimal space-y-2 pl-6">
                <li>
                  The agent calls add_note or record_observation (defined with
                  needsApproval: true in the Vercel AI SDK).
                </li>
                <li>
                  The SDK pauses before the tool&apos;s execute function runs.
                </li>
                <li>
                  The UI shows an approval card with exactly what will be
                  written.
                </li>
                <li>You click Approve or Cancel.</li>
                <li>
                  Only on Approve does execute run and call Medplum. On Cancel,
                  nothing is saved.
                </li>
                <li>
                  Medplum then checks the AccessPolicy for the signed-in user
                  and accepts or rejects the write.
                </li>
              </ol>
              <p>
                The gate surfaces writes for human review; your AccessPolicy
                stays the source of truth for who can write what. Read the full
                breakdown in{" "}
                <Link
                  href="/approval-gated-writes"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  how approval-gated writes work
                </Link>
                .
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              Launch it inside the Medplum app (SMART on FHIR)
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                You do not have to run Last EHR as a separate destination.
                Medplum implements SMART App Launch, so registering Last EHR
                takes one resource: create a ClientApplication in your project
                with launchUri pointing at your deployment&apos;s /launch route
                and redirectUri at /launch/callback, and set that
                application&apos;s id as SMART_CLIENT_ID in your deployment.
              </p>
              <p>
                After that, Last EHR appears on the Apps tab of every Patient
                and Encounter page in app.medplum.com. Launching it opens the
                chat already scoped to the patient the clinician was viewing,
                reusing the Medplum sign-in instead of asking for a separate
                one. The launch is a standard OAuth2 authorization-code flow
                with PKCE (public client, no secret), and the resulting session
                is bounded by the granted SMART scopes and your AccessPolicy.
                Writes still stop at the approval card.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              Use bounded chart reads over MCP
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                <code>@lastehr/mcp</code> is an installable MCP server for
                hosted or self-hosted Medplum. Use its setup command to add it
                to Claude Code, Cursor, or another MCP client, then search
                patients and read charts with the same Medplum identity your
                client is configured to use.
              </p>
              <p>
                The published package is read-only by default: two tools,
                <code>search_patients</code> and <code>show_patient_info</code>.
                Writes exist only behind an explicit opt-in
                (<code>LASTEHR_MCP_WRITES=proposal</code>) that carries the
                approval-card semantics onto MCP: the client renders the exact
                proposed fields through MCP elicitation and nothing saves
                without a human&apos;s approval, per action. Hosts that cannot
                render that approval never see a write tool.
              </p>
              <p>
                This is a different thing from Medplum&apos;s own MCP server:
                theirs exposes Medplum data broadly for building your own
                agent; this one exposes two bounded chart reads and no direct
                writes.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              Run it on your Medplum: setup, env vars, and your own model key
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                Last EHR is a Next.js app. The one-click Vercel deploy button in
                the{" "}
                <Link
                  href="https://github.com/cbetz/last-ehr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  README
                </Link>{" "}
                prompts for the required env vars. To run it locally:
              </p>
              <pre className="overflow-x-auto rounded-lg border bg-card p-4 text-sm text-foreground">
                <code>{`git clone https://github.com/cbetz/last-ehr.git
cd last-ehr
npm install
cp .env.example .env.local   # then edit .env.local
npm run seed                 # load synthetic patients into your Medplum
npm run dev                  # http://localhost:3000/demo`}</code>
              </pre>
              <p>At minimum, set:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  A model key: OPENAI_API_KEY (default provider),
                  ANTHROPIC_API_KEY with AI_PROVIDER=anthropic, or AWS
                  credentials with AI_PROVIDER=bedrock and MODEL_ID.
                </li>
                <li>
                  MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET: a Medplum
                  ClientApplication, used by the seed script and by the
                  no-sign-in quickstart mode (NEXT_PUBLIC_QUICKSTART=true).
                </li>
                <li>
                  MEDPLUM_BASE_URL and NEXT_PUBLIC_MEDPLUM_BASE_URL if you run
                  your own Medplum; leave blank for Medplum&apos;s hosted API.
                </li>
              </ul>
              <p>
                Every variable is documented in .env.example. The seed script
                loads four synthetic patients so you can test without any real
                data. Then open /demo and ask the agent to find a patient.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              Alpha status, PHI, and BAAs: what you can and cannot do today
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                Last EHR is in active development. APIs are not stable and the
                scope will grow. Use synthetic data only at this stage.
              </p>
              <p>
                Do not point this at real patient data without agreements in
                place. Last EHR is not a HIPAA-covered service, and the
                approval gate is a write-safety control, not a privacy control:
                anything the agent reads is sent to your model provider as
                context, under your API key. Handling real PHI would require a
                BAA with your model provider that covers API traffic (consumer
                plans do not qualify), a HIPAA-eligible FHIR backend with its
                own BAA (Medplum offers HIPAA-eligible hosted plans; check
                their current terms), and your own compliance review.
              </p>
              <p>
                Last EHR is Apache-2.0. Self-hosting is free. A managed tier
                (hosted Medplum, a signed BAA, multi-tenancy, billing) may
                follow, built only after the open-source core has proven value.
              </p>
            </div>
          </section>

          <Faq items={faqs} />

          <section className="container max-w-3xl py-16 text-center">
            <h2 className="text-3xl font-bold">See it on synthetic patients</h2>
            <p className="mx-auto mt-4 max-w-2xl text-xl text-muted-foreground">
              The live demo runs the same four tools against seeded synthetic
              data. Every write goes through the approval card.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/demo" className={buttonVariants()}>
                Try the live demo
              </Link>
              <Link
                href="/headless-ehr"
                className={buttonVariants({ variant: "outline" })}
              >
                What is a headless EHR?
              </Link>
            </div>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
