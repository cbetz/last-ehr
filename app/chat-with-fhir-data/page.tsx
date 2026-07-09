import type { Metadata } from "next";
import Link from "next/link";

import Navbar from "@/components/Navbar";
import { SiteFooter } from "@/components/site-footer";
import { Faq, type FaqItem } from "@/components/faq";
import { IconGitHub } from "@/components/ui/icons";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Chat with FHIR Data: How an LLM Reads a Patient Chart",
  description:
    "How an LLM reads FHIR patient data: chart context assembly, the read and write paths, approval gates, and where the data actually goes.",
  keywords: [
    "chat with FHIR data",
    "LLM FHIR",
    "FHIR chat interface",
    "FHIR AI assistant",
    "FHIR LLM agent",
  ],
  alternates: { canonical: "/chat-with-fhir-data" },
  openGraph: {
    type: "article",
    title: "Chat with FHIR Data: How an LLM Reads a Patient Chart",
    description:
      "Chart context assembly, the read and write paths, approval gates, and where FHIR data actually goes when you chat with it.",
    url: "https://www.lastehr.com/chat-with-fhir-data",
    images: ["https://www.lastehr.com/opengraph-image"],
  },
};

const faqs: FaqItem[] = [
  {
    q: "When I open a chart in Last EHR, where does the patient data go?",
    a: "The agent fetches the FHIR resources from your backend, projects them into a structured summary, and sends that summary to your configured model provider as part of the chat prompt, under your key or provider credentials. The data does not stay in Last EHR; the layer stores no patient data of its own. This is why a BAA with your model provider matters if you ever handle real PHI.",
  },
  {
    q: "What does the approval gate actually protect against?",
    a: "It prevents unilateral writes. When the agent proposes adding a note or recording an observation, you see an approval card with the data before it is saved, and you can reject it. It does not prevent chart data from being sent to the model provider on reads; that happens regardless. For privacy you need the right provider agreements and access controls, not just an approval gate.",
  },
  {
    q: "Can I use Last EHR with real patient data?",
    a: "Not without proper setup, and not while it is alpha. You would need a BAA with your model provider that covers clinical data, a HIPAA-eligible FHIR backend with its own BAA, and your own security and compliance review. The safe default is synthetic data, which is what the seed script and the live demo use.",
  },
  {
    q: "Does Last EHR work with backends other than Medplum?",
    a: "Not yet. The tool implementations use Medplum's client libraries. The architecture (the agent, the tools, the approval gate) is backend-agnostic by design, and Aidbox, HAPI FHIR, and Firely are the goal for future adapters. If you want to port it, the FHIR calls in lib/ai/tools.ts are the seam.",
  },
  {
    q: "What clinical data can the agent read and write?",
    a: "Reads: search patients by name, and open a chart showing conditions, allergies, observations (vitals and labs), medications, immunizations, and prior notes. Writes: add a free-text note (a Communication resource) or record an observation (an Observation resource), both approval-gated. Other resource types are not exposed today.",
  },
  {
    q: "If I self-host, do I still need to think about BAAs?",
    a: "Yes. Self-hosting addresses infrastructure and data residency, but the agent still sends chart context to your model provider. If that context ever includes real PHI, you need a qualifying agreement with the provider. Self-hosting does not remove that relationship; it just puts you in control of everything else.",
  },
];

export default function ChatWithFhirDataPage() {
  return (
    <>
      <Navbar />
      <main>
        <article>
          <section className="container max-w-3xl py-16 sm:py-24">
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">
              Chat with FHIR data: how an LLM reads a patient chart
            </h1>
            <p className="mt-6 text-xl text-muted-foreground">
              A language model never reads a chart the way a clinician does.
              The FHIR resources that make up the chart get fetched, projected
              into text, and sent to the model as context. Understanding how
              that works, and where the data actually goes, matters before you
              point any AI at patient records.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/demo" className={buttonVariants()}>
                Try it on synthetic patients
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
              What chatting with FHIR data actually means
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                An LLM has no native understanding of FHIR. When you ask an
                agent to look up a patient, what happens is:
              </p>
              <ol className="list-decimal space-y-2 pl-6">
                <li>
                  The agent calls a FHIR API (Medplum, in Last EHR&apos;s
                  case) and fetches structured resources: Patient, Condition,
                  AllergyIntolerance, Observation, Communication,
                  MedicationRequest, Immunization.
                </li>
                <li>
                  Those resources are projected into a compact summary: a list
                  of conditions, allergies, medications with dosages, recent
                  vitals and labs, and prior notes.
                </li>
                <li>
                  That summary, along with your question, goes to the language
                  model as a prompt.
                </li>
                <li>The model reads the context and responds.</li>
              </ol>
              <p>
                The model itself never touches your FHIR backend. The agent
                sits in the middle and does the translation. Your backend does
                not need to know about the model provider, and the model never
                makes a FHIR API call.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              Grounding the model: turning FHIR resources into chart context
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                Raw FHIR is powerful but verbose. One patient&apos;s chart can
                be dozens of resources, each with codes, references, and
                metadata a chat does not need. The agent&apos;s job is to
                extract the clinically relevant parts and present them
                cleanly.
              </p>
              <p>
                Last EHR&apos;s show_patient_info tool does exactly this: it
                fetches demographics, conditions, allergies, observations
                (sorted by date), notes, medications, and immunizations, then
                projects each resource down to the fields that matter (a
                label, a value, a date). The UI renders those as structured
                cards; the same projection becomes the model&apos;s context.
              </p>
              <p>
                This grounding step is where ambiguity starts. If an
                observation is missing a date, or a dosage lives in free text
                instead of structured fields, the model&apos;s context gets
                weaker. Consistent coding and complete fields in the backend
                are what make the difference between a model that reflects the
                chart and one that guesses.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              The read path and the write path are different problems
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">The read path</strong> is a
                privacy question. Whenever the agent opens a chart, that
                context goes to the model provider with no approval step. This
                is by design (the agent needs the picture to be useful), but
                it means your provider choice and agreements govern reads, not
                any UI control.
              </p>
              <p>
                <strong className="text-foreground">The write path</strong> is
                a safety question. When the agent proposes a write, it does
                not execute. Last EHR shows an approval card with exactly what
                will be saved, and only your click runs the write. The
                backend&apos;s AccessPolicy then bounds what the signed-in
                user can actually create. The full mechanics are on the{" "}
                <Link
                  href="/approval-gated-writes"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  approval-gated writes
                </Link>{" "}
                page, including what the gate does not protect against
                (approval fatigue, hallucinated content, and the ungated read
                path).
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              Try it: the live demo on synthetic patients
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                The fastest way to understand the flow is the{" "}
                <Link
                  href="/demo"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  live demo
                </Link>
                . No sign-up; everything runs on seeded synthetic patients.
                Try:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  &quot;Find patients named Smith&quot;: the agent searches
                  and shows results with a View record button.
                </li>
                <li>
                  &quot;Show me Jane Smith&apos;s chart&quot;: the full chart
                  renders as cards: demographics, conditions, medications,
                  observations, immunizations, notes.
                </li>
                <li>
                  &quot;Record a heart rate of 72 bpm for Maria Garcia&quot;:
                  the agent proposes an Observation and stops at the approval
                  card. Nothing saves until you click Approve.
                </li>
              </ul>
              <p>
                On the public demo, writes are tagged per visitor session, so
                you only ever see the seed data plus your own edits. That
                keeps a shared demo from becoming a mess of strangers&apos;
                writes; it is a demo mechanism, not a product feature.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              PHI, HIPAA, and BAAs: where your chart data goes
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                Last EHR is open-source alpha software, and it is not a
                HIPAA-covered service. If you point it at real patient data,
                compliance is on you. The essentials:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-foreground">
                    Reads require a provider agreement.
                  </strong>{" "}
                  Chart context goes to your model provider under your key.
                  Some providers offer BAAs covering API traffic on qualifying
                  plans (OpenAI and Anthropic among them); consumer plans do
                  not qualify.
                </li>
                <li>
                  <strong className="text-foreground">
                    The backend must be HIPAA-eligible.
                  </strong>{" "}
                  Medplum offers HIPAA-eligible hosted plans with BAAs; check
                  their current terms. If you self-host a FHIR server,
                  securing it is your job.
                </li>
                <li>
                  <strong className="text-foreground">
                    The layer stores nothing.
                  </strong>{" "}
                  Last EHR keeps no database and no copy of chart data. Data
                  lives in your backend and, during a request, at your model
                  provider.
                </li>
                <li>
                  <strong className="text-foreground">
                    Synthetic data is the right default.
                  </strong>{" "}
                  The seed script loads four synthetic patients with realistic
                  but fake charts. The live demo uses exactly that data.
                </li>
              </ul>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              The landscape: research, MCP servers, and where Last EHR fits
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                Last EHR is not the only project connecting language models
                and FHIR, and it is worth knowing the categories.
              </p>
              <p>
                <strong className="text-foreground">Research projects</strong>{" "}
                such as LLMonFHIR (an academic open-source effort) study how
                to ground LLMs on FHIR data: terminology, normalization,
                evaluation. Useful reading if you want the theory behind
                context assembly.
              </p>
              <p>
                <strong className="text-foreground">MCP servers</strong>,
                including Medplum&apos;s own, expose FHIR data to
                MCP-compatible clients over the Model Context Protocol. That
                is programmatic plumbing: the right layer if you are building
                your own agent and want standardized access to a backend. It
                does not come with a clinician-facing UI or an approval gate.
              </p>
              <p>
                <strong className="text-foreground">Last EHR</strong> is an
                application layer: a ready-to-run chat UI with four FHIR tools
                and the approval card built in. It runs on Medplum, or fully
                locally on HAPI FHIR. Additional backends plug in through the
                FhirBackend adapter seam. It also
                exposes its four tools as an MCP server of its own, read-only
                by default, so the categories meet in the middle: use the chat
                UI when you want the approval card in front of a person, or
                the MCP surface when you are bringing your own client.
              </p>
            </div>
          </section>

          <section className="container max-w-3xl py-8">
            <h2 className="text-3xl font-bold">
              Run it on your own FHIR backend
            </h2>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                You need a Medplum project (their free tier works for
                evaluation), or local HAPI FHIR, plus one supported model
                provider credential and the code:
              </p>
              <pre className="overflow-x-auto rounded-lg border bg-card p-4 text-sm text-foreground">
                <code>{`git clone https://github.com/cbetz/last-ehr.git
cd last-ehr
npm install
cp .env.example .env.local   # add your Medplum + model keys
npm run seed                 # load synthetic patients
npm run dev                  # http://localhost:3000/demo`}</code>
              </pre>
              <p>
                The FHIR tools live in lib/ai/tools.ts and the agent route in
                app/api/chat/route.ts. Multi-tenancy, users, and permissions
                come from your Medplum project (Project, ProjectMembership,
                AccessPolicy); the layer does not reimplement them. Porting to
                Aidbox, Oystehr, or Firely means implementing the backend
                adapter contract; that is the intended seam, and contributions
                are welcome. Setup details are on the{" "}
                <Link
                  href="/medplum-ai-agent"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Medplum AI agent
                </Link>{" "}
                page.
              </p>
            </div>
          </section>

          <Faq items={faqs} />

          <section className="container max-w-3xl py-16 text-center">
            <h2 className="text-3xl font-bold">Chat with a synthetic chart</h2>
            <p className="mx-auto mt-4 max-w-2xl text-xl text-muted-foreground">
              Search a patient, open the chart, and watch a proposed write stop
              at the approval card.
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
