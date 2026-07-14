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
import { DismissibleNotice } from "@/components/demo/dismissible-notice";
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

// The chat API writes its error bodies for users (rate limit, expired session,
// model failure), and the transport surfaces that body as error.message. Show
// messages we recognize verbatim; anything else gets a generic fallback.
const FRIENDLY_ERROR_PREFIXES = [
  "Rate limit reached",
  "Your demo session expired",
  "The model call failed",
  "A chart request failed",
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

  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
    addToolApprovalResponse,
  } = useChat<ChatMessage>({
    // headers is a function so the transport (constructed once) reads the
    // CURRENT picker choice from a ref; state alone would go stale in the
    // closure.
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: (): Record<string, string> =>
        !SCRIPTED_DEMO && demoModelRef.current
          ? { "x-demo-model": demoModelRef.current }
          : {},
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
      <div className="pb-[200px] pt-4 md:pt-10">
        {messages.length === 0 ? (
          <EmptyScreen submitMessage={ask} scriptedDemo={SCRIPTED_DEMO} />
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
                            {part.text}
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
                                onApprove={async () => {
                                  track("demo_write_approval", {
                                    tool: "add_note",
                                    approved: true,
                                  });
                                  if (!(await ensureSession())) return;
                                  addToolApprovalResponse({
                                    id: part.approval.id,
                                    approved: true,
                                  });
                                  maybeShowConversion();
                                }}
                                onCancel={async () => {
                                  track("demo_write_approval", {
                                    tool: "add_note",
                                    approved: false,
                                  });
                                  if (!(await ensureSession())) return;
                                  addToolApprovalResponse({
                                    id: part.approval.id,
                                    approved: false,
                                  });
                                  maybeShowConversion();
                                }}
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
                                ]}
                                preview={{
                                  resourceType: "Observation",
                                  status: "final",
                                  code: { text: part.input.label },
                                  subject: {
                                    reference: `Patient/${part.input.patientId}`,
                                  },
                                  effectiveDateTime:
                                    "<server time when approved>",
                                  valueQuantity: {
                                    value: part.input.value,
                                    unit: part.input.unit,
                                    system: "http://unitsofmeasure.org",
                                    code: part.input.unit,
                                  },
                                }}
                                onApprove={async () => {
                                  track("demo_write_approval", {
                                    tool: "record_observation",
                                    approved: true,
                                  });
                                  if (!(await ensureSession())) return;
                                  addToolApprovalResponse({
                                    id: part.approval.id,
                                    approved: true,
                                  });
                                  maybeShowConversion();
                                }}
                                onCancel={async () => {
                                  track("demo_write_approval", {
                                    tool: "record_observation",
                                    approved: false,
                                  });
                                  if (!(await ensureSession())) return;
                                  addToolApprovalResponse({
                                    id: part.approval.id,
                                    approved: false,
                                  });
                                  maybeShowConversion();
                                }}
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

      <div className="fixed inset-x-0 bottom-0 w-full bg-gradient-to-b from-muted/30 from-0% to-muted/30 to-50% duration-300 ease-in-out animate-in dark:from-background/10 dark:from-10% dark:to-background/80">
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
                      }}
                    >
                      <IconPlus />
                      <span className="sr-only">New Chat</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New Chat</TooltipContent>
                </Tooltip>
                {!SCRIPTED_DEMO && DEMO_MODELS.length > 0 && (
                  <div className="absolute bottom-1.5 left-0 sm:left-4">
                    <label className="sr-only" htmlFor="demo-model">
                      Model
                    </label>
                    <select
                      id="demo-model"
                      value={demoModel}
                      onChange={(e) => pickDemoModel(e.target.value)}
                      className="max-w-[180px] rounded border bg-background px-1.5 py-0.5 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">Default model</option>
                      {DEMO_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
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
                  className="min-h-[60px] w-full resize-none bg-transparent px-4 py-[1.3rem] focus:outline-none sm:text-sm"
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
