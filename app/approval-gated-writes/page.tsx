import type { Metadata } from "next";
import Link from "next/link";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";
import { Faq, type FaqItem } from "@/components/faq";
import { IconGitHub } from "@/components/ui/icons";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "AI Approval-Gated Writes for FHIR Charts",
  description:
    "How approval-gated writes work in Last EHR: the agent proposes, you approve, then it saves to FHIR. An honest look at the pattern and its limits.",
  keywords: [
    "approval gated AI writes",
    "AI agent write access EHR",
    "human in the loop clinical AI",
    "LLM write to EHR safely",
    "AI charting human approval",
  ],
  alternates: { canonical: "/approval-gated-writes" },
  openGraph: {
    type: "article",
    title: "AI Approval-Gated Writes for FHIR Charts",
    description:
      "The agent proposes, you approve, then it saves to FHIR. How the pattern works and what it does not protect against.",
    url: "https://www.lastehr.com/approval-gated-writes",
    images: ["https://www.lastehr.com/opengraph-image"],
  },
};

const faqs: FaqItem[] = [
  {
    q: "Can the AI agent write to the chart without my approval?",
    a: "No. Last EHR sets needsApproval: true on the write tools (add_note and record_observation). The Vercel AI SDK pauses before the write executes, shows you an approval card with the exact data the agent proposes, and only runs the write when you click Approve. This is a UI-level boundary enforced by the SDK, plus a backend-level boundary enforced by your Medplum AccessPolicy.",
  },
  {
    q: "What if the proposal looks wrong?",
    a: "The card shows what will be saved: the note text word for word, or the observation label, value, and unit. If it looks wrong, click Cancel. The proposal is not persisted anywhere; it simply disappears. Only clicking Approve triggers the backend write, and you can reject proposals as many times as needed.",
  },
  {
    q: "Does the approval gate protect me from the AI hallucinating?",
    a: "It gives you a chance to catch hallucinations, but only if you read the proposals. If the agent invents a symptom and you approve without reading, it will be saved. The gate is a human-in-the-loop boundary, not an automatic fact checker. Approval fatigue is real; if you approve every proposal without reading, the gate fails.",
  },
  {
    q: "What data does the AI see, and where does it go?",
    a: "When the agent reads the chart, it pulls FHIR resources from your Medplum backend and sends them to your model provider (OpenAI or Anthropic) as context, under your API key. Last EHR stores no patient data itself. For real PHI, you would need BAAs with both your model provider and your backend. The demo runs on synthetic data only.",
  },
  {
    q: "Can I edit a proposal before I approve it?",
    a: "No. Proposals are atomic: you approve them as-is or cancel them. If you want different wording or a different value, cancel and ask the agent again. This keeps the approval simple: you approve exactly what you see, and what you see is what saves.",
  },
  {
    q: "Who enforces the approval gate at the backend?",
    a: "Your Medplum AccessPolicy. The agent runs as the signed-in user, scoped by your access controls. If your AccessPolicy says the user cannot create Observations, the backend rejects the write even after the UI gate passes. The approval card is a user-experience boundary; the backend is the security boundary.",
  },
];

export default function ApprovalGatedWritesPage() {
  return (
    <>
      <Navbar />
      <main>
        <article>
          <section className="container max-w-3xl py-16 sm:py-24">
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">
              How approval-gated writes let an AI agent write to the chart
            </h1>
            <p className="mt-6 text-xl text-muted-foreground">
              Writing to a patient&apos;s chart is a high-stakes operation.
              Last EHR&apos;s approval gate is a human-in-the-loop boundary:
              the agent proposes a write, you review it on screen, and only
              your click saves it to the FHIR backend. This page explains how
              the pattern works, what it protects against, and what it does
              not.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/demo" className={buttonVariants()}>
                Try the approval gate live
              </Link>
              <Link
                href="https://github.com/cbetz/last-ehr"
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                <IconGitHub className="mr-2 h-4 w-4" aria-hidden="true" />
                Read the source
              </Link>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              Why writes are the risk surface
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                An AI agent working over clinical data has two kinds of
                operations: reads and writes. Reads are a privacy question:
                any chart context the agent pulls goes to your model provider,
                under your API key, with no approval step. Writes are a
                different kind of risk: they touch the system of record.
              </p>
              <p>
                When the agent writes, it is making a claim that becomes part
                of the clinical record. A model might misread a lab value or
                confabulate a detail that sounds right but is wrong. If those
                writes saved silently, they would become chart facts that
                influence later decisions.
              </p>
              <p>
                The approval gate interrupts that flow. It stops unilateral
                writes. But it is not magic: it is a boundary, and boundaries
                only work if someone stands there and pays attention.
              </p>
              <p>
                This tradeoff is not hypothetical. Medplum&apos;s own{" "}
                <Link
                  href="https://www.medplum.com/docs/provider/spaces"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Spaces assistant
                </Link>{" "}
                takes the other branch: its agent loop executes writes as soon
                as it reaches them, and its docs recommend reviewing the
                resulting resources and scoping the ai feature to
                AccessPolicies without write access to high-risk types. That
                is a legitimate design (account-level policy scoping bounds
                what the assistant can ever touch), and it is exactly the
                design this page argues against for clinically meaningful
                writes: a policy decides what an agent may write, a gate makes
                a person decide whether it writes this, now.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              The proposal pattern: propose, then approve, then save
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                Last EHR uses the Vercel AI SDK&apos;s needsApproval flag on
                its write tools. This is the actual tool definition, abridged
                from{" "}
                <Link
                  href="https://github.com/cbetz/last-ehr/blob/main/lib/ai/tools.ts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  lib/ai/tools.ts
                </Link>
                :
              </p>
              <pre className="overflow-x-auto rounded-lg border bg-card p-4 text-sm text-foreground">
                <code>{`record_observation: tool({
  inputSchema: z.object({
    patientId: z.string(),
    label: z.string(),   // e.g. "Systolic blood pressure"
    value: z.number(),
    unit: z.string(),    // e.g. "mmHg"
  }),
  needsApproval: true,   // the SDK pauses here
  execute: async ({ patientId, label, value, unit }) => {
    // Runs ONLY after the user clicks Approve.
    return medplum.createResource({
      resourceType: "Observation",
      status: "final",
      code: { text: label },
      subject: { reference: \`Patient/\${patientId}\` },
      valueQuantity: { value, unit },
    });
  },
}),`}</code>
              </pre>
              <ol className="list-decimal space-y-2 pl-6">
                <li>
                  <strong className="text-foreground">Agent proposes:</strong>{" "}
                  the agent calls add_note or record_observation with the data
                  filled in.
                </li>
                <li>
                  <strong className="text-foreground">SDK intercepts:</strong>{" "}
                  because needsApproval is set, execute does not run. Nothing
                  hits the backend.
                </li>
                <li>
                  <strong className="text-foreground">
                    UI renders the card:
                  </strong>{" "}
                  you see exactly what is proposed: the note text, or the
                  label, value, and unit.
                </li>
                <li>
                  <strong className="text-foreground">Approve:</strong> execute
                  runs and the resource is created on the backend.
                </li>
                <li>
                  <strong className="text-foreground">Cancel:</strong> the
                  proposal disappears. Nothing is saved.
                </li>
              </ol>
              <p>
                The proposal itself is not persisted. It lives in the chat
                session until you decide.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              Anatomy of a proposed write: the two resource types
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                Last EHR makes two kinds of writes, both standard FHIR
                resources.
              </p>
              <p>
                <strong className="text-foreground">
                  Notes (Communication).
                </strong>{" "}
                A note becomes a FHIR Communication with status completed, a
                subject pointing at the Patient, the note text as payload, and
                a sent timestamp. The approval card shows the full text, word
                for word.
              </p>
              <p>
                <strong className="text-foreground">
                  Observations (Observation).
                </strong>{" "}
                A vital or lab value becomes a FHIR Observation with a label,
                a numeric value, and a UCUM-style unit in valueQuantity, plus
                status final and an effectiveDateTime. The card shows the
                label, value, and unit.
              </p>
              <p>
                The exact resource shapes are in the open source, so what gets
                written is inspectable down to the field. On the public demo,
                writes are additionally tagged with your session so you only
                see the seed data plus your own edits; on a self-hosted
                instance, your Medplum AccessPolicy is the only boundary that
                matters.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              Two enforcement layers: the UI gate and the backend AccessPolicy
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">
                  The UI layer (the approval card).
                </strong>{" "}
                The SDK holds the write until you click Approve. This is a
                user-experience boundary, not a security boundary: it is where
                a human reads and decides.
              </p>
              <p>
                <strong className="text-foreground">
                  The backend layer (AccessPolicy).
                </strong>{" "}
                When the write executes, it runs as the signed-in user, scoped
                by your Medplum AccessPolicy. If your policy forbids creating
                Observations, the backend rejects the request no matter what
                happened in the UI. The agent cannot see what you cannot see
                and cannot write what your policy forbids.
              </p>
              <p>
                The two layers are independent. The UI gate stops thoughtless
                writes; the backend gate enforces permissions even if the UI
                is bypassed. Neither is a guarantee, but together they raise
                the bar.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              What the gate does not protect against
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">Approval fatigue.</strong>{" "}
                If you always click Approve, the card becomes a ritual, not a
                review. Two decades of alert-fatigue research in clinical
                software says this is the default failure mode. The UI cannot
                fix that; only reading the proposals can.
              </p>
              <p>
                <strong className="text-foreground">
                  Hallucinated content.
                </strong>{" "}
                The agent can propose a note containing a detail nobody said.
                The card gives you the chance to catch it; it does not catch
                it for you.
              </p>
              <p>
                <strong className="text-foreground">Ungated reads.</strong>{" "}
                Anything the agent reads from the chart goes to your model
                provider as context before any write is proposed. The gate
                controls writes; reads are governed by your provider choice
                and agreements, not by approval.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              Where chart context goes: the model provider, your key, no PHI
              stored
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                When the agent reads the chart, it pulls FHIR resources from
                your Medplum backend and includes them in the prompt to your
                model provider, under your API key. Last EHR keeps no database
                of its own: no cache of chart data, no copy of the record.
                Data flows through your browser session, your Medplum backend,
                and your model provider; on the hosted demo it also passes
                through the app&apos;s server routes on Vercel.
              </p>
              <p>
                Handling real PHI would require BAAs with both your model
                provider and your FHIR backend; consumer API keys do not
                qualify. The demo runs on synthetic data only. The design
                intent is that the layer holds nothing: you bring the backend,
                the model key, and the responsibility.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              Open questions and where the pattern should go next
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                The approval gate is a starting point, not a solved problem.
                Open questions worth debating:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-foreground">Approval modes.</strong>{" "}
                  Should low-risk writes ever batch, or skip the card? Today
                  every write is gated, every time. Safe, but it may not scale
                  past a few writes per session.
                </li>
                <li>
                  <strong className="text-foreground">Editability.</strong>{" "}
                  Should you be able to edit a proposed note before approving?
                  Today proposals are atomic: approve as-is or cancel.
                </li>
                <li>
                  <strong className="text-foreground">Audit.</strong> The
                  backend versions and logs the write itself, but a canceled
                  proposal leaves no trace. Should &quot;user saw this and
                  rejected it&quot; be recorded?
                </li>
                <li>
                  <strong className="text-foreground">Scope.</strong> Notes
                  and observations are deliberately low-risk write types.
                  Conditions, medications, and orders would each raise the
                  stakes and demand more than a single confirm click.
                </li>
                <li>
                  <strong className="text-foreground">
                    Surfaces without a card.
                  </strong>{" "}
                  Over MCP there is no approval card at all; the host&apos;s
                  generic tool prompt is the only gate. The MCP server
                  therefore starts read-only, with the write tools behind an
                  explicit opt-in flag. Is that the right default, or should
                  MCP writes be proposal-shaped: a draft plus a separate
                  explicit confirm call?
                </li>
              </ul>
              <p>
                If you have opinions on any of these, the{" "}
                <Link
                  href="https://github.com/cbetz/last-ehr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  GitHub repo
                </Link>{" "}
                is open.
              </p>
            </div>
          </section>

          <Faq items={faqs} />

          <section className="container max-w-3xl py-16 text-center">
            <h2 className="text-3xl font-bold">See the gate in action</h2>
            <p className="mx-auto mt-4 max-w-2xl text-xl text-muted-foreground">
              Ask the demo to record a vital for a synthetic patient and watch
              the proposal stop at the card.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/demo" className={buttonVariants()}>
                Try the live demo
              </Link>
              <Link
                href="/medplum-ai-agent"
                className={buttonVariants({ variant: "outline" })}
              >
                Run it on your Medplum
              </Link>
            </div>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
