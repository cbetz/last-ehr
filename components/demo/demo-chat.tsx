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
import { EmptyScreen } from "@/components/empty-screen";
import { track } from "@/lib/analytics";

// The chat API writes its error bodies for users (rate limit, expired session,
// model failure), and the transport surfaces that body as error.message. Show
// messages we recognize verbatim; anything else gets a generic fallback.
const FRIENDLY_ERROR_PREFIXES = [
  "Rate limit reached",
  "Your demo session expired",
  "The model call failed",
];

function errorText(error: Error): string {
  const message = error.message ?? "";
  return FRIENDLY_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix))
    ? message
    : "Something went wrong. Please try again.";
}

export function DemoChat() {
  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
    addToolApprovalResponse,
  } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
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
    // Error copy is ours (never chart content), so it is safe to report.
    if (error) track("demo_error_shown", { message: error.message ?? "" });
  }, [error]);

  // SMART-launched sessions run against the user's own Medplum project, so
  // the public demo's synthetic-data banner would be wrong there.
  const [smartSession, setSmartSession] = useState(false);
  useEffect(() => {
    setSmartSession(document.cookie.includes("smart_session=1"));
  }, []);

  const ask = async (text: string) => {
    track("demo_message_sent");
    // Ensure the /api/chat route can read the current Medplum session: the
    // sign-in form isn't mounted once you're already authenticated, so refresh
    // the server-set HttpOnly session cookie here before every send. The token
    // is posted to a server route rather than written to document.cookie, so it
    // never lives in a JS-readable cookie.
    const token = medplum.getAccessToken();
    if (token) {
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken: token }),
      });
    }
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
      {!smartSession && (
        <div className="border-b border-amber-300/40 bg-amber-50 px-4 py-2 text-center dark:border-amber-500/20 dark:bg-amber-950/40">
          <p className="mx-auto max-w-2xl text-xs text-amber-800 dark:text-amber-200">
            Live demo on synthetic data. Please don&apos;t enter real patient
            information. Changes you make are visible only in your own session.
          </p>
        </div>
      )}
      <div className="pb-[200px] pt-4 md:pt-10">
        {messages.length === 0 ? (
          <EmptyScreen submitMessage={ask} />
        ) : (
          <div className="relative mx-auto max-w-2xl px-4">
            {messages.map((message, mi) => (
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
                        return (
                          <BotCard key={part.toolCallId}>
                            <MessageSkeleton />
                          </BotCard>
                        );

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
                        return (
                          <BotCard key={part.toolCallId}>
                            <MessageSkeleton />
                          </BotCard>
                        );

                      case "tool-add_note":
                        if (part.state === "approval-requested") {
                          return (
                            <BotCard key={part.toolCallId} showAvatar={false}>
                              <ConfirmWrite
                                title="Add this note to the chart?"
                                detail={part.input.text}
                                onApprove={() => {
                                  track("demo_write_approval", {
                                    tool: "add_note",
                                    approved: true,
                                  });
                                  addToolApprovalResponse({
                                    id: part.approval.id,
                                    approved: true,
                                  });
                                }}
                                onCancel={() => {
                                  track("demo_write_approval", {
                                    tool: "add_note",
                                    approved: false,
                                  });
                                  addToolApprovalResponse({
                                    id: part.approval.id,
                                    approved: false,
                                  });
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
                        return (
                          <BotCard key={part.toolCallId}>
                            <MessageSkeleton />
                          </BotCard>
                        );

                      case "tool-record_observation":
                        if (part.state === "approval-requested") {
                          return (
                            <BotCard key={part.toolCallId} showAvatar={false}>
                              <ConfirmWrite
                                title="Record this observation?"
                                detail={`${part.input.label}: ${part.input.value} ${part.input.unit}`}
                                onApprove={() => {
                                  track("demo_write_approval", {
                                    tool: "record_observation",
                                    approved: true,
                                  });
                                  addToolApprovalResponse({
                                    id: part.approval.id,
                                    approved: true,
                                  });
                                }}
                                onCancel={() => {
                                  track("demo_write_approval", {
                                    tool: "record_observation",
                                    approved: false,
                                  });
                                  addToolApprovalResponse({
                                    id: part.approval.id,
                                    approved: false,
                                  });
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
                        return (
                          <BotCard key={part.toolCallId}>
                            <MessageSkeleton />
                          </BotCard>
                        );

                      default:
                        return null;
                    }
                  })
                )}
              </div>
            ))}

            {status === "submitted" && (
              <div className="pb-4">
                <BotCard>
                  <MessageSkeleton />
                </BotCard>
              </div>
            )}
            {error && (
              <div className="pb-4">
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
            <form
              ref={formRef}
              onSubmit={(e) => {
                e.preventDefault();
                const value = input.trim();
                setInput("");
                if (value) ask(value);
              }}
            >
              <div className="relative flex max-h-60 w-full grow flex-col overflow-hidden bg-background px-8 sm:rounded-md sm:border sm:px-12">
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
                      }}
                    >
                      <IconPlus />
                      <span className="sr-only">New Chat</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New Chat</TooltipContent>
                </Tooltip>
                <Textarea
                  tabIndex={0}
                  onKeyDown={onKeyDown}
                  placeholder="Ask about a patient…"
                  className="min-h-[60px] w-full resize-none bg-transparent px-4 py-[1.3rem] focus-within:outline-none sm:text-sm"
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
