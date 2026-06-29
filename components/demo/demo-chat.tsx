"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
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

export function DemoChat() {
  const { messages, sendMessage, status, error, setMessages } =
    useChat<ChatMessage>({
      transport: new DefaultChatTransport({ api: "/api/chat" }),
    });
  const [input, setInput] = useState("");
  const { formRef, onKeyDown } = useEnterSubmit();
  const medplum = useMedplum();

  const ask = async (text: string) => {
    // Ensure the /api/chat route can read the current Medplum session — the
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

  return (
    <>
      <div className="pb-[200px] pt-4 md:pt-10">
        {messages.length === 0 ? (
          <EmptyScreen submitMessage={ask} />
        ) : (
          <div className="relative mx-auto max-w-2xl px-4">
            {messages.map((message) => (
              <div key={message.id} className="pb-4">
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
                                onSelect={(id) =>
                                  ask(`Show patient info for id ${id}`)
                                }
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
                              <PatientCard patient={part.output.patient} />
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
                <BotMessage>
                  Something went wrong. Please try again.
                </BotMessage>
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
