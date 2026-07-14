import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
  type InferUITools,
  type UIDataTypes,
} from "ai";
import { cookies } from "next/headers";

import { getChatModel, isScriptedDemoEnabled } from "@/lib/ai/model";
import {
  toSafeChatErrorLog,
  toSafeChatErrorMessage,
} from "@/lib/ai/chat-errors";
import { parseDemoModels, resolveDemoModel } from "@/lib/ai/demo-models";
import { buildTools, SYSTEM_PROMPT } from "@/lib/ai/tools";
import { findDeniedProposals, recordRejectedProposal } from "@/lib/fhir/audit";
import { createFhirBackend } from "@/lib/fhir/backend";
import { ScriptedDemoBackend } from "@/lib/fhir/scripted-demo";
import { checkRateLimit, getClientIp } from "@/lib/utils/rate-limit";

// Node runtime so @medplum/core works; allow time for the multi-step tool loop.
export const runtime = "nodejs";
export const maxDuration = 30;

export type ChatTools = InferUITools<ReturnType<typeof buildTools>>;
export type ChatMessage = UIMessage<never, UIDataTypes, ChatTools>;

// Error bodies double as the user-facing message: the useChat transport turns
// a non-OK response body into error.message, and the client shows any message
// matching these openings verbatim (see errorText in demo-chat.tsx).
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("medplum_access_token")?.value;
  if (!accessToken) {
    return new Response(
      "Your demo session expired. Refresh the page to start a new one.",
      { status: 401 },
    );
  }

  // Protect the public demo from a traffic spike / abuse: cap requests per IP
  // (and globally, to bound model spend). See lib/utils/rate-limit.ts.
  const { success, resetAfter } = await checkRateLimit(getClientIp(req));
  if (!success) {
    const retryAfter = Math.max(1, Math.ceil(resetAfter / 1000));
    return new Response(
      "Rate limit reached. To keep this demo up for everyone, requests are " +
        "capped per visitor and overall. Please wait a minute and try again.",
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }

  // Tags demo writes so a visitor sees seed data + only their own edits.
  const sessionId = cookieStore.get("demo_session_id")?.value;

  let messages: UIMessage[];
  try {
    ({ messages } = (await req.json()) as { messages: UIMessage[] });
  } catch {
    return new Response("Invalid request body.", { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Invalid request body.", { status: 400 });
  }

  // Optional demo model picker: the header is honored only for allowlisted
  // ids on aggregator providers; anything else falls back to MODEL_ID.
  const demoModel = resolveDemoModel(
    req.headers.get("x-demo-model"),
    parseDemoModels(process.env.NEXT_PUBLIC_DEMO_MODELS),
  );

  const backend = createFhirBackend(accessToken);
  const tools = buildTools(
    isScriptedDemoEnabled()
      ? new ScriptedDemoBackend(backend, sessionId)
      : backend,
    sessionId,
  );

  // Opt-in rejected-proposal audit trail. Uses the raw backend, not the
  // scripted wrapper: AuditEvents are system writes, not agent tool writes,
  // so they are outside the scripted demo's narrowed write surface. Audit
  // failures are logged and never block the chat turn.
  if (process.env.LASTEHR_AUDIT_REJECTED_PROPOSALS === "true") {
    for (const denial of findDeniedProposals(messages)) {
      try {
        await recordRejectedProposal(backend, denial, sessionId);
      } catch (error) {
        console.error(
          "Rejected-proposal audit failed:",
          toSafeChatErrorLog(error),
        );
      }
    }
  }

  const result = streamText({
    model: getChatModel(demoModel),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse({
    // Without this, mid-stream failures (model provider down, key over quota)
    // reach the client as a masked "An error occurred". Model-provider
    // failures arrive as AI_* API errors. Do not echo arbitrary FHIR or
    // upstream diagnostics to the browser: a backend error can contain a
    // resource id or other chart-adjacent detail, and analytics must never
    // receive it either.
    onError: (error) => {
      // Log a compact summary, never the raw error object: provider errors
      // embed the full request body (messages + chart context) in
      // requestBodyValues, which must not reach hosted logs.
      console.error("Chat stream error:", toSafeChatErrorLog(error));
      return toSafeChatErrorMessage(error);
    },
  });
}
