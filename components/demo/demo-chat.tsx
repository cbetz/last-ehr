"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { useMedplum } from "@medplum/react-hooks";
import Textarea from "react-textarea-autosize";

import type { ChatMessage } from "@/app/api/chat/route";
import {
  BotCard,
  BotMessage,
  MessageSkeleton,
  Patients,
  UserMessage,
} from "@/components/chat";
import { PatientCard } from "@/components/chat/patient";
import { ConfirmWrite } from "@/components/chat/confirm-write";
import {
  codeObservation,
  OBSERVATION_REPLACES_EXTENSION,
  UCUM_SYSTEM,
} from "@/lib/fhir/vitals";
import { ChatScrollAnchor } from "@/lib/hooks/chat-scroll-anchor";
import { useEnterSubmit } from "@/lib/hooks/use-enter-submit";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IconArrowElbow, IconPlus } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import {
  ConversionCard,
  conversionCardDismissed,
} from "@/components/demo/conversion-card";
import { AssistantMarkdown } from "@/components/demo/assistant-markdown";
import { DismissibleNotice } from "@/components/demo/dismissible-notice";
import { useDemoBackend } from "@/components/demo/demo-backend";
import { DevPanel } from "@/components/demo/dev-panel";
import type { FhirDevEvent } from "@/lib/fhir/observed";
import { EmptyScreen } from "@/components/empty-screen";
import { track } from "@/lib/analytics";
import { parseDemoModels } from "@/lib/ai/demo-models";

// Build-time inlined picker options; empty means no picker rendered. The
// server re-checks every request against the same list, so this is display
// state, not a control.
const DEMO_MODELS = parseDemoModels(process.env.NEXT_PUBLIC_DEMO_MODELS);
// This flag is deliberately public: it changes the copy and available controls
// so a local evaluator cannot mistake the fixed walkthrough for an LLM agent.
// The server independently requires AI_PROVIDER=scripted plus its local-HAPI
// guard before it enables the scripted provider.
const SCRIPTED_DEMO = process.env.NEXT_PUBLIC_SCRIPTED_DEMO === "true";
// Renders the "Under the hood" toggle. Display state only: the server
// independently gates event emission on the same flag plus a demo session,
// so real (SMART/signed-in) sessions never stream FHIR detail regardless.
const DEV_OUTPUT = process.env.NEXT_PUBLIC_DEMO_DEV_OUTPUT === "true";
// Bounded so a long conversation cannot grow the panel without limit.
const DEV_EVENT_CAP = 200;

// The chat API writes its error bodies for users (rate limit, expired session,
// model failure), and the transport surfaces that body as error.message. Show
// messages we recognize verbatim; anything else gets a generic fallback.
// Approval-card rendering of the observation coding, derived from the same
// pinned table the write tool uses (lib/fhir/vitals.ts) so the card cannot
// drift from what saves.
function observationCodingRows(
  label: string,
  unit: string,
): { label: string; value: string }[] {
  const coded = codeObservation(label, unit);
  const loinc = coded.code.coding?.[0];
  return [
    ...(loinc
      ? [{ label: "Code", value: `LOINC ${loinc.code} — ${loinc.display}` }]
      : [{ label: "Code", value: `${label} (text only — no standard code)` }]),
    ...(coded.ucum
      ? [{ label: "Unit", value: `UCUM ${coded.ucum}` }]
      : [{ label: "Unit", value: `${unit} (no UCUM code — saved as text)` }]),
  ];
}

function observationPreview(
  patientId: string,
  label: string,
  value: number,
  unit: string,
) {
  const coded = codeObservation(label, unit);
  return {
    resourceType: "Observation",
    status: "final",
    code: coded.code,
    ...(coded.category ? { category: coded.category } : {}),
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: "<server time when approved>",
    valueQuantity: {
      value,
      unit,
      ...(coded.ucum ? { system: UCUM_SYSTEM, code: coded.ucum } : {}),
    },
  };
}

// read_chart_section returns `related`, `truncated`, `includeUnsupported`,
// and `codeFilterUnmatched` conditionally, so the card reads them defensively
// rather than widening the tool's return type for the sake of the view.
type ChartReadOutput = {
  entries: { id: string; text: string; date: string }[];
  truncated?: boolean;
  related?: { id: string; resourceType: string; text: string }[];
  includeUnsupported?: boolean;
  codeFilterUnmatched?: boolean;
};

const chartReadTruncated = (output: unknown): boolean =>
  (output as ChartReadOutput | undefined)?.truncated === true;

const chartReadIncludeUnsupported = (output: unknown): boolean =>
  (output as ChartReadOutput | undefined)?.includeUnsupported === true;

const chartReadCodeFilterUnmatched = (output: unknown): boolean =>
  (output as ChartReadOutput | undefined)?.codeFilterUnmatched === true;

const chartReadRelated = (
  output: unknown,
): { id: string; resourceType: string; text: string }[] =>
  (output as ChartReadOutput | undefined)?.related ?? [];

const FRIENDLY_ERROR_PREFIXES = [
  "Rate limit reached",
  "Your demo session expired",
  "The model call failed",
  "A chart request failed",
  "This write is blocked by deployment policy",
];

function errorText(error: Error): string {
  const message = error.message ?? "";
  return FRIENDLY_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix))
    ? message
    : "Something went wrong. Please try again.";
}

function errorCategory(error: Error): string {
  const message = error.message ?? "";
  if (message.startsWith("Rate limit reached")) return "rate_limited";
  if (message.startsWith("Your demo session expired")) return "session_expired";
  if (message.startsWith("The model call failed")) return "model_failed";
  if (message.startsWith("A chart request failed")) return "chart_failed";
  return "unknown";
}

export function DemoChat() {
  // Demo model picker choice (empty string = deployment default). Persisted
  // per browser; read back in an effect to avoid a hydration mismatch.
  const demoModelRef = useRef("");
  const [demoModel, setDemoModel] = useState("");
  useEffect(() => {
    if (SCRIPTED_DEMO) return;
    const saved = window.localStorage.getItem("lastehr-demo-model") ?? "";
    if (saved && DEMO_MODELS.some((m) => m.id === saved)) {
      demoModelRef.current = saved;
      setDemoModel(saved);
    }
  }, []);
  const pickDemoModel = (id: string) => {
    demoModelRef.current = id;
    setDemoModel(id);
    try {
      window.localStorage.setItem("lastehr-demo-model", id);
    } catch {
      // Storage unavailable; the choice still applies for this session.
    }
  };

  // Demo backend picker (see components/demo/demo-backend.tsx). The ref
  // mirrors the context value for the transport's headers function, exactly
  // like the model picker above; the server re-validates every request.
  const {
    backends: demoBackends,
    backendId: demoBackend,
    pickBackend,
    pickerEnabled: backendPickerEnabled,
  } = useDemoBackend();
  const demoBackendRef = useRef("");
  useEffect(() => {
    demoBackendRef.current = backendPickerEnabled ? demoBackend : "";
  }, [demoBackend, backendPickerEnabled]);

  // "Under the hood" panel state, fed by the stream's transient dev-output
  // data parts (they arrive via onData only and are never part of message
  // history). devBackendName is the server-confirmed resolved backend.
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [devEvents, setDevEvents] = useState<FhirDevEvent[]>([]);
  const [devBackendName, setDevBackendName] = useState<string | undefined>();
  const clearDevEvents = () => {
    setDevEvents([]);
    setDevBackendName(undefined);
  };

  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
    addToolApprovalResponse,
  } = useChat<ChatMessage>({
    onData: (part) => {
      if (part.type === "data-fhir") {
        setDevEvents((prev) => [...prev.slice(-(DEV_EVENT_CAP - 1)), part.data]);
      } else if (part.type === "data-backend") {
        setDevBackendName(part.data.name);
      }
    },
    // headers is a function so the transport (constructed once) reads the
    // CURRENT picker choice from a ref; state alone would go stale in the
    // closure.
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: (): Record<string, string> => ({
        ...(!SCRIPTED_DEMO && demoModelRef.current
          ? { "x-demo-model": demoModelRef.current }
          : {}),
        ...(demoBackendRef.current
          ? { "x-demo-backend": demoBackendRef.current }
          : {}),
      }),
    }),
    // Resume automatically only after the user answers a write approval, so the
    // gated tool's execute runs. All tools execute server-side inside
    // streamText's own step loop, so we must NOT auto-resend on completed tool
    // calls: every server-tool turn ends "complete with tool calls," which
    // would re-send the conversation on a loop.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const [input, setInput] = useState("");
  const { formRef, onKeyDown } = useEnterSubmit();
  const medplum = useMedplum();

  useEffect(() => {
    // Record only a fixed category. Backend and model error text can contain
    // chart-adjacent diagnostics and must never be sent to analytics.
    if (error) track("demo_error_shown", { category: errorCategory(error) });
  }, [error]);

  // SMART-launched sessions run against the user's own Medplum project, so
  // the public demo's synthetic-data banner would be wrong there.
  const [smartSession, setSmartSession] = useState(false);
  useEffect(() => {
    setSmartSession(document.cookie.includes("smart_session=1"));
  }, []);

  // The conversion card appears once, right after the visitor's first
  // approve or reject decision, and stays until dismissed. SMART sessions
  // are clinician context, so no marketing card there.
  const [showConversion, setShowConversion] = useState(false);
  const maybeShowConversion = () => {
    if (!smartSession && !conversionCardDismissed()) setShowConversion(true);
  };

  // Switching backends starts a new conversation: the transcript holds
  // patient ids valid only on the old backend, and clearing messages also
  // discards any pending approval card so a proposal can never execute
  // against a different backend than the one that produced it. The
  // demo_session_id cookie is backend-agnostic, so earlier tagged writes
  // reappear when the visitor switches back.
  const switchBackend = (id: string) => {
    if (id === demoBackend) return;
    if (messages.length > 0) {
      if (
        !window.confirm(
          "Switching backends starts a new conversation. Your demo edits stay saved on each backend.",
        )
      ) {
        return;
      }
      setMessages([]);
      setInput("");
      setShowConversion(false);
    }
    // The panel documents one backend's conversation; a switch resets it.
    clearDevEvents();
    pickBackend(id);
    // Static allowlisted label only, per the analytics policy.
    track("demo_backend_picked", { backend: id || "default" });
  };

  // Answer a write-approval card. The card can be discarded while
  // ensureSession is in flight (a backend switch clears the conversation);
  // answering a no-longer-present approval must be a no-op, not an
  // unhandled rejection.
  const respondToApproval = async (
    tool: string,
    approvalId: string,
    approved: boolean,
  ) => {
    track("demo_write_approval", { tool, approved });
    if (!(await ensureSession())) return;
    try {
      await addToolApprovalResponse({ id: approvalId, approved });
    } catch {
      // The conversation was cleared out from under the card; nothing to do.
    }
    maybeShowConversion();
  };

  // Re-arm the server session cookie before every send and approval response.
  // Sign-in sessions renew from the client-side Medplum token (posted to a
  // server route rather than written to document.cookie, so it never lives in
  // a JS-readable cookie; the sign-in form isn't mounted once authenticated).
  // Quickstart sessions re-POST /api/auth/quickstart, which is cheap (the
  // server reuses its cached shared token): the cookie's life is capped at
  // that shared token's remaining life, so a visitor who lands late in the
  // token's window would otherwise lose the session mid-conversation. SMART
  // sessions are left alone; their cookie belongs to the launch flow, and
  // minting quickstart would clobber it with the shared demo credential.
  // Set when the quickstart re-arm fails; rendered above the input so the
  // user gets "busy, try again" instead of sending anyway, getting a 401, and
  // being told (wrongly) to refresh away their demo writes.
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const ensureSession = async (): Promise<boolean> => {
    setSessionNotice(null);
    const token = medplum.getAccessToken();
    if (token) {
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken: token }),
      });
      return true;
    }
    if (document.cookie.includes("smart_session=1")) return true;
    if (process.env.NEXT_PUBLIC_QUICKSTART !== "true") return true;
    try {
      // fetch resolves on 429/502, so a non-ok response must be checked here,
      // not just a thrown network error.
      const res = await fetch("/api/auth/quickstart", { method: "POST" });
      if (res.ok) return true;
    } catch {
      // Network hiccup; fall through to the transient notice.
    }
    setSessionNotice("The demo is busy right now, so that didn't send. Try again in a moment.");
    return false;
  };

  const ask = async (text: string) => {
    track("demo_message_sent");
    if (!(await ensureSession())) return;
    sendMessage({ text });
  };

  // A SMART App Launch redirects here with ?patient=<id> (the patient the
  // clinician was viewing). Open that chart immediately so the launch lands in
  // context. Ref guards against StrictMode double-invoking the effect.
  const launchedPatient = useRef(false);
  useEffect(() => {
    if (launchedPatient.current) return;
    const id = new URLSearchParams(window.location.search).get("patient");
    if (id && /^[A-Za-z0-9-]{1,64}$/.test(id)) {
      launchedPatient.current = true;
      track("demo_smart_launch");
      ask(`Show patient info for id ${id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Input-bar controls. The backend select is the mid-conversation SWITCH
  // surface; the pre-chat pick lives in the EmptyScreen card, so the two
  // never show at once (messages.length gates them). The row reserves
  // bottom padding in the textarea so it never overlaps the placeholder.
  const showModelPicker = !SCRIPTED_DEMO && DEMO_MODELS.length > 0;
  const showBackendSelect = backendPickerEnabled && messages.length > 0;
  const showDevToggle = DEV_OUTPUT && !smartSession;
  const hasInputControls = showModelPicker || showBackendSelect || showDevToggle;

  return (
    <>
      {SCRIPTED_DEMO && !smartSession && (
        <DismissibleNotice
          storageKey="lastehr-demo-scripted-dismissed"
          className="border-b border-sky-300/40 bg-sky-50 px-4 py-2 text-center dark:border-sky-500/20 dark:bg-sky-950/40"
        >
          <p className="mx-auto max-w-2xl px-8 text-xs text-sky-900 dark:text-sky-100">
            <strong>Scripted local demo.</strong> No external model is used.
            Every message follows the same synthetic sequence: find Maria
            Garcia, propose a 72 bpm heart-rate observation, then wait for
            your approval. It cannot browse other records.
          </p>
        </DismissibleNotice>
      )}
      {!smartSession && (
        <DismissibleNotice
          storageKey="lastehr-demo-synthetic-dismissed"
          className="border-b border-amber-300/40 bg-amber-50 px-4 py-2 text-center dark:border-amber-500/20 dark:bg-amber-950/40"
        >
          <p className="mx-auto max-w-2xl px-8 text-xs text-amber-800 dark:text-amber-200">
            Synthetic data only: don&apos;t enter real patient information.
            Changes are visible only in your session.
          </p>
        </DismissibleNotice>
      )}
      <div
        className={`pb-[200px] pt-4 md:pt-10 ${devPanelOpen ? "lg:pr-96" : ""}`}
      >
        {messages.length === 0 ? (
          <EmptyScreen
            submitMessage={ask}
            scriptedDemo={SCRIPTED_DEMO}
            backendPicker={
              backendPickerEnabled
                ? {
                    backends: demoBackends,
                    value: demoBackend,
                    onPick: switchBackend,
                  }
                : undefined
            }
          />
        ) : (
          <div className="relative mx-auto max-w-2xl px-4">
            {messages.map((message, mi) => {
              // A tool part in a non-terminal state (input streaming, waiting
              // to execute) only deserves a loading skeleton while it can
              // still finish: its message is the latest one and a request is
              // in flight. Otherwise (the stream errored, or the conversation
              // moved on) render nothing, so a failed turn degrades to the
              // error line instead of pulsing boxes that never resolve.
              const stillRunning =
                mi === messages.length - 1 &&
                (status === "submitted" || status === "streaming");
              const pendingSkeleton = (key: string) =>
                stillRunning ? (
                  <BotCard key={key}>
                    <MessageSkeleton />
                  </BotCard>
                ) : null;
              return (
              // space-y-4 keeps a consistent gap between the parts of one
              // assistant turn (cards, tool results, text), matching the pb-4
              // gap between turns.
              <div key={`${message.id}-${mi}`} className="space-y-4 pb-4">
                {message.role === "user" ? (
                  <UserMessage>
                    {message.parts
                      .map((p) => (p.type === "text" ? p.text : ""))
                      .join("")}
                  </UserMessage>
                ) : (
                  message.parts.map((part, i) => {
                    switch (part.type) {
                      case "text":
                        return part.text ? (
                          <BotMessage key={`${message.id}-${i}`}>
                            <AssistantMarkdown>{part.text}</AssistantMarkdown>
                          </BotMessage>
                        ) : null;

                      case "tool-search_patients":
                        if (part.state === "output-available") {
                          return (
                            <BotCard key={part.toolCallId} showAvatar={false}>
                              <Patients
                                patients={part.output.patients}
                                onSelect={(id) => {
                                  track("demo_view_record_clicked");
                                  ask(`Show patient info for id ${id}`);
                                }}
                              />
                            </BotCard>
                          );
                        }
                        if (part.state === "output-error") {
                          return (
                            <BotMessage key={part.toolCallId}>
                              Sorry, the patient search failed: {part.errorText}
                            </BotMessage>
                          );
                        }
                        return pendingSkeleton(part.toolCallId);

                      case "tool-show_patient_info":
                        if (part.state === "output-available") {
                          return (
                            <BotCard key={part.toolCallId} showAvatar={false}>
                              <PatientCard {...part.output} />
                            </BotCard>
                          );
                        }
                        if (part.state === "output-error") {
                          return (
                            <BotMessage key={part.toolCallId}>
                              Sorry, I couldn&apos;t load that patient:{" "}
                              {part.errorText}
                            </BotMessage>
                          );
                        }
                        return pendingSkeleton(part.toolCallId);

                      case "tool-read_document": {
                        if (part.state === "output-available") {
                          // The tool returns a discriminated union: a readable
                          // document has `text`, an unreadable one has
                          // `unreadable`. Narrow rather than assume.
                          const doc = part.output;
                          const body = "text" in doc ? doc.text : undefined;
                          const truncated =
                            "truncated" in doc ? doc.truncated === true : false;
                          return (
                            <BotCard key={part.toolCallId} showAvatar={false}>
                              <div className="rounded-lg border bg-background p-4">
                                <p className="text-sm font-medium">
                                  {part.output.title}
                                  {part.output.date && (
                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                      {part.output.date}
                                    </span>
                                  )}
                                </p>
                                <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">
                                  {part.output.contentType}
                                </p>
                                {body ? (
                                  <>
                                    {/* The boundary is for the model; the
                                        reader gets the note itself, in a box
                                        that scrolls rather than widening the
                                        page. */}
                                    <pre className="mt-3 max-h-80 max-w-full overflow-auto whitespace-pre-wrap border-t pt-3 font-mono text-xs leading-6 text-muted-foreground">
                                      {body.replace(/<\/?chart_text>/g, "")}
                                    </pre>
                                    {truncated && (
                                      <p className="mt-3 border-t pt-3 text-xs leading-5 text-amber-600 dark:text-amber-400">
                                        Only the opening of this document was
                                        read. The rest exists and was not shown.
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  /* Never a blank box: an unread document must
                                     not look like an empty one. */
                                  <p className="mt-3 border-t pt-3 text-xs leading-5 text-amber-600 dark:text-amber-400">
                                    {"unreadable" in doc ? doc.unreadable : null}
                                  </p>
                                )}
                              </div>
                            </BotCard>
                          );
                        }
                        return null;
                      }

                      case "tool-read_chart_section":
                        if (part.state === "output-available") {
                          return (
                            <BotCard key={part.toolCallId} showAvatar={false}>
                              <div className="rounded-lg border bg-background p-4">
                                <p className="text-sm font-medium">
                                  {part.output.resourceType}
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    {part.output.entries.length} record
                                    {part.output.entries.length === 1 ? "" : "s"}
                                  </span>
                                </p>
                                {part.output.entries.length > 0 ? (
                                  <ul className="mt-3 space-y-2">
                                    {part.output.entries.map((entry) => (
                                      <li
                                        key={entry.id}
                                        className="flex items-baseline justify-between gap-3 text-sm"
                                      >
                                        {/* The tool wraps free text in the
                                            untrusted-content boundary for
                                            the model; the reader gets just
                                            the text. */}
                                        <span className="min-w-0">
                                          {entry.text.replace(/<\/?chart_text>/g, "")}
                                        </span>
                                        {entry.date && (
                                          <span className="shrink-0 text-xs text-muted-foreground">
                                            {entry.date}
                                          </span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="mt-2 text-sm text-muted-foreground">
                                    {/* Never a bare "none exist" when the
                                        read was capped or a lookup was
                                        refused — the reader is the safety
                                        boundary and gets at least as much
                                        honesty as the model does. */}
                                    {chartReadCodeFilterUnmatched(part.output)
                                      ? "No record in this section carries that code."
                                      : chartReadTruncated(part.output)
                                        ? "No matching records in the window that was read."
                                        : "No matching records in this section."}
                                  </p>
                                )}
                                {chartReadRelated(part.output).length > 0 && (
                                  <div className="mt-4 border-t pt-3">
                                    <p className="font-mono text-[0.65rem] uppercase tracking-[0.13em] text-muted-foreground">
                                      Referenced records
                                    </p>
                                    <ul className="mt-2 space-y-1.5">
                                      {chartReadRelated(part.output).map((row) => (
                                        <li
                                          key={`${row.resourceType}/${row.id}`}
                                          className="flex items-baseline gap-2 text-sm"
                                        >
                                          <span className="shrink-0 border border-border px-1.5 py-0.5 font-mono text-[0.6rem] text-muted-foreground">
                                            {row.resourceType}
                                          </span>
                                          <span className="min-w-0">
                                            {row.text.replace(/<\/?chart_text>/g, "")}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {chartReadTruncated(part.output) && (
                                  <p className="mt-3 border-t pt-3 text-xs leading-5 text-amber-600 dark:text-amber-400">
                                    Only the newest {part.output.entries.length}{" "}
                                    matching records were read. Older ones may
                                    exist, so narrow the dates or ask for more.
                                  </p>
                                )}
                                {chartReadIncludeUnsupported(part.output) && (
                                  <p className="mt-3 border-t pt-3 text-xs leading-5 text-amber-600 dark:text-amber-400">
                                    This backend would not resolve the
                                    referenced records, so none are shown. That
                                    is not the same as there being none.
                                  </p>
                                )}
                                {chartReadCodeFilterUnmatched(part.output) && (
                                  <p className="mt-3 border-t pt-3 text-xs leading-5 text-amber-600 dark:text-amber-400">
                                    This section does hold records. None of them
                                    carry that code, and records with text-only
                                    entries cannot match a coded search. Read
                                    the section without a code to see them.
                                  </p>
                                )}
                              </div>
                            </BotCard>
                          );
                        }
                        if (part.state === "output-error") {
                          return (
                            <BotMessage key={part.toolCallId}>
                              Sorry, that chart section couldn&apos;t be read:{" "}
                              {part.errorText}
                            </BotMessage>
                          );
                        }
                        return pendingSkeleton(part.toolCallId);

                      case "tool-add_note":
                        if (part.state === "approval-requested") {
                          return (
                            <BotCard key={part.toolCallId} showAvatar={false}>
                              <ConfirmWrite
                                title="Add this note to the chart?"
                                resourceType="Communication"
                                fields={[
                                  {
                                    label: "Patient",
                                    value: `Patient/${part.input.patientId}`,
                                  },
                                  { label: "Note", value: part.input.text },
                                ]}
                                preview={{
                                  resourceType: "Communication",
                                  status: "completed",
                                  subject: {
                                    reference: `Patient/${part.input.patientId}`,
                                  },
                                  sent: "<server time when approved>",
                                  payload: [
                                    { contentString: part.input.text },
                                  ],
                                }}
                                onApprove={() =>
                                  respondToApproval(
                                    "add_note",
                                    part.approval.id,
                                    true,
                                  )
                                }
                                onCancel={() =>
                                  respondToApproval(
                                    "add_note",
                                    part.approval.id,
                                    false,
                                  )
                                }
                              />
                            </BotCard>
                          );
                        }
                        if (part.state === "output-available") {
                          return (
                            <BotMessage key={part.toolCallId}>
                              ✓ Note saved to the chart.
                            </BotMessage>
                          );
                        }
                        if (part.state === "output-error") {
                          return (
                            <BotMessage key={part.toolCallId}>
                              Sorry, I couldn&apos;t save that note:{" "}
                              {part.errorText}
                            </BotMessage>
                          );
                        }
                        return pendingSkeleton(part.toolCallId);

                      case "tool-record_observation":
                        if (part.state === "approval-requested") {
                          return (
                            <BotCard key={part.toolCallId} showAvatar={false}>
                              <ConfirmWrite
                                title="Record this observation?"
                                resourceType="Observation"
                                fields={[
                                  {
                                    label: "Patient",
                                    value: `Patient/${part.input.patientId}`,
                                  },
                                  { label: "Label", value: part.input.label },
                                  {
                                    label: "Value",
                                    value: `${part.input.value} ${part.input.unit}`,
                                  },
                                  // The derived codes are clinically
                                  // meaningful, so the reviewer sees them
                                  // rather than discovering them on the
                                  // chart. Same shared function the write
                                  // tool builds from.
                                  ...observationCodingRows(
                                    part.input.label,
                                    part.input.unit,
                                  ),
                                ]}
                                preview={observationPreview(
                                  part.input.patientId,
                                  part.input.label,
                                  part.input.value,
                                  part.input.unit,
                                )}
                                onApprove={() =>
                                  respondToApproval(
                                    "record_observation",
                                    part.approval.id,
                                    true,
                                  )
                                }
                                onCancel={() =>
                                  respondToApproval(
                                    "record_observation",
                                    part.approval.id,
                                    false,
                                  )
                                }
                              />
                            </BotCard>
                          );
                        }
                        if (part.state === "output-available") {
                          return (
                            <BotMessage key={part.toolCallId}>
                              ✓ Observation recorded.
                            </BotMessage>
                          );
                        }
                        if (part.state === "output-error") {
                          return (
                            <BotMessage key={part.toolCallId}>
                              Sorry, I couldn&apos;t record that:{" "}
                              {part.errorText}
                            </BotMessage>
                          );
                        }
                        return pendingSkeleton(part.toolCallId);

                      case "tool-record_superseding_observation":
                        if (part.state === "approval-requested") {
                          return (
                            <BotCard key={part.toolCallId} showAvatar={false}>
                              <ConfirmWrite
                                title="File a superseding observation?"
                                resourceType="Observation"
                                fields={[
                                  {
                                    label: "Patient",
                                    value: `Patient/${part.input.patientId}`,
                                  },
                                  // The raw id is not optional: the reviewer
                                  // needs to see exactly which row is being
                                  // superseded, and the conformance suite
                                  // requires every argument value to appear
                                  // in the rendering.
                                  {
                                    label: "Supersedes",
                                    value: `Observation/${part.input.supersedes}`,
                                  },
                                  {
                                    label: "New value",
                                    value: `${part.input.value} ${part.input.unit}`,
                                  },
                                  // Stated where the Approve button is, not
                                  // inside the collapsed FHIR preview.
                                  {
                                    label: "Note",
                                    value:
                                      "The earlier entry stays on the chart as a final result. This does not mark it as an error, and does not delete it. Retracting it requires the EHR's own correction workflow.",
                                  },
                                ]}
                                preview={{
                                  resourceType: "Observation",
                                  status: "final",
                                  code: "<copied from the superseded observation>",
                                  subject: {
                                    reference: `Patient/${part.input.patientId}`,
                                  },
                                  effectiveDateTime:
                                    "<copied from the superseded observation>",
                                  issued: "<server time when approved>",
                                  valueQuantity: {
                                    value: part.input.value,
                                    unit: part.input.unit,
                                  },
                                  extension: [
                                    {
                                      url: OBSERVATION_REPLACES_EXTENSION,
                                      valueReference: {
                                        reference: `Observation/${part.input.supersedes}`,
                                      },
                                    },
                                  ],
                                }}
                                onApprove={() =>
                                  respondToApproval(
                                    "record_superseding_observation",
                                    part.approval.id,
                                    true,
                                  )
                                }
                                onCancel={() =>
                                  respondToApproval(
                                    "record_superseding_observation",
                                    part.approval.id,
                                    false,
                                  )
                                }
                              />
                            </BotCard>
                          );
                        }
                        if (part.state === "output-available") {
                          return (
                            <BotMessage key={part.toolCallId}>
                              ✓ Superseding observation saved. The earlier
                              entry remains on the chart.
                            </BotMessage>
                          );
                        }
                        if (part.state === "output-error") {
                          return (
                            <BotMessage key={part.toolCallId}>
                              Sorry, I couldn&apos;t file that correction:{" "}
                              {part.errorText}
                            </BotMessage>
                          );
                        }
                        return pendingSkeleton(part.toolCallId);

                      case "tool-create_task":
                        if (part.state === "approval-requested") {
                          return (
                            <BotCard key={part.toolCallId} showAvatar={false}>
                              <ConfirmWrite
                                title="Create this task?"
                                resourceType="Task"
                                fields={[
                                  {
                                    label: "Patient",
                                    value: `Patient/${part.input.patientId}`,
                                  },
                                  {
                                    label: "Task",
                                    value: part.input.description,
                                  },
                                  ...(part.input.dueDate
                                    ? [
                                        {
                                          label: "Due",
                                          value: part.input.dueDate,
                                        },
                                      ]
                                    : []),
                                ]}
                                preview={{
                                  resourceType: "Task",
                                  status: "requested",
                                  intent: "order",
                                  description: part.input.description,
                                  for: {
                                    reference: `Patient/${part.input.patientId}`,
                                  },
                                  authoredOn: "<server time when approved>",
                                  ...(part.input.dueDate
                                    ? {
                                        restriction: {
                                          period: {
                                            end: `${part.input.dueDate}T23:59:59Z`,
                                          },
                                        },
                                      }
                                    : {}),
                                }}
                                onApprove={() =>
                                  respondToApproval(
                                    "create_task",
                                    part.approval.id,
                                    true,
                                  )
                                }
                                onCancel={() =>
                                  respondToApproval(
                                    "create_task",
                                    part.approval.id,
                                    false,
                                  )
                                }
                              />
                            </BotCard>
                          );
                        }
                        if (part.state === "output-available") {
                          return (
                            <BotMessage key={part.toolCallId}>
                              ✓ Task created.
                            </BotMessage>
                          );
                        }
                        if (part.state === "output-error") {
                          return (
                            <BotMessage key={part.toolCallId}>
                              Sorry, I couldn&apos;t create that task:{" "}
                              {part.errorText}
                            </BotMessage>
                          );
                        }
                        return pendingSkeleton(part.toolCallId);

                      default:
                        return null;
                    }
                  })
                )}
              </div>
              );
            })}

            {showConversion && !smartSession && (
              <div className="pb-4">
                <ConversionCard onDismiss={() => setShowConversion(false)} />
              </div>
            )}
            {status === "submitted" && (
              <div className="pb-4" role="status">
                <span className="sr-only">Waiting for the assistant…</span>
                <BotCard>
                  <MessageSkeleton />
                </BotCard>
              </div>
            )}
            {error && (
              <div className="pb-4" role="alert">
                <BotMessage>{errorText(error)}</BotMessage>
              </div>
            )}
          </div>
        )}
        <ChatScrollAnchor trackVisibility={true} />
      </div>

      {devPanelOpen && DEV_OUTPUT && !smartSession && (
        <DevPanel
          backendName={devBackendName}
          events={devEvents}
          onClose={() => setDevPanelOpen(false)}
        />
      )}

      <div
        className={`fixed inset-x-0 bottom-0 w-full bg-gradient-to-b from-muted/30 from-0% to-muted/30 to-50% duration-300 ease-in-out animate-in dark:from-background/10 dark:from-10% dark:to-background/80 ${devPanelOpen ? "lg:pr-96" : ""}`}
      >
        <div className="mx-auto sm:max-w-2xl sm:px-4">
          <div className="space-y-4 border-t bg-background px-4 py-2 shadow-lg sm:rounded-t-xl sm:border md:py-4">
            {sessionNotice && (
              <p role="alert" className="text-center text-xs text-muted-foreground">
                {sessionNotice}
              </p>
            )}
            <form
              ref={formRef}
              onSubmit={(e) => {
                e.preventDefault();
                const value = input.trim();
                setInput("");
                if (value) ask(value);
              }}
            >
              <div className="relative flex max-h-60 w-full grow flex-col overflow-hidden bg-background px-8 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 sm:rounded-md sm:border sm:px-12">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="absolute left-0 top-4 h-8 w-8 rounded-full bg-background p-0 sm:left-4"
                      onClick={(e) => {
                        e.preventDefault();
                        setMessages([]);
                        setInput("");
                        // The card's copy claims a write just happened, which
                        // is no longer true in a fresh conversation. Dismissal
                        // semantics are unchanged: only the localStorage flag
                        // suppresses it permanently.
                        setShowConversion(false);
                        clearDevEvents();
                      }}
                    >
                      <IconPlus />
                      <span className="sr-only">New Chat</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New Chat</TooltipContent>
                </Tooltip>
                {hasInputControls && (
                  <div className="absolute bottom-1.5 left-0 flex gap-1 sm:left-4">
                    {showDevToggle && (
                      <button
                        type="button"
                        aria-pressed={devPanelOpen}
                        onClick={() => {
                          if (!devPanelOpen) track("demo_dev_panel_opened");
                          setDevPanelOpen((open) => !open);
                        }}
                        className="rounded border bg-background px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Under the hood
                      </button>
                    )}
                    {showBackendSelect && (
                      <>
                        <label className="sr-only" htmlFor="demo-backend">
                          Backend
                        </label>
                        <select
                          id="demo-backend"
                          value={demoBackend}
                          onChange={(e) => switchBackend(e.target.value)}
                          // Not `status !== "ready"`: the error state is the
                          // one moment a visitor most wants to switch away
                          // from a failing backend.
                          disabled={
                            status === "submitted" || status === "streaming"
                          }
                          className="max-w-[140px] rounded border bg-background px-1.5 py-0.5 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {demoBackends.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.label}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    {showModelPicker && (
                      <>
                        <label className="sr-only" htmlFor="demo-model">
                          Model
                        </label>
                        <select
                          id="demo-model"
                          value={demoModel}
                          onChange={(e) => pickDemoModel(e.target.value)}
                          className="max-w-[140px] rounded border bg-background px-1.5 py-0.5 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">Default model</option>
                          {DEMO_MODELS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                )}
                <Textarea
                  tabIndex={0}
                  onKeyDown={onKeyDown}
                  placeholder={
                    SCRIPTED_DEMO
                      ? "Run the scripted approval demo…"
                      : "Ask about a patient…"
                  }
                  // pb-10 when the controls row is present so its absolutely
                  // positioned chips never sit on top of the placeholder or
                  // typed text (the row is pinned to the container's bottom).
                  className={`min-h-[60px] w-full resize-none bg-transparent px-4 pt-[1.3rem] focus:outline-none sm:text-sm ${
                    hasInputControls ? "pb-10" : "pb-[1.3rem]"
                  }`}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  name="message"
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <div className="absolute right-0 top-4 sm:right-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="submit"
                        size="icon"
                        disabled={input.trim() === "" || status !== "ready"}
                      >
                        <IconArrowElbow />
                        <span className="sr-only">Send message</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Send message</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
