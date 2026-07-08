import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
  type InferUITools,
  type UIDataTypes,
} from "ai";
import { cookies } from "next/headers";

import { getChatModel } from "@/lib/ai/model";
import { buildTools, SYSTEM_PROMPT } from "@/lib/ai/tools";
import { createFhirBackend } from "@/lib/fhir/backend";
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

  const result = streamText({
    model: getChatModel(),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: buildTools(createFhirBackend(accessToken), sessionId),
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse({
    // Without this, mid-stream failures (model provider down, key over quota)
    // reach the client as a masked "An error occurred". Model-provider
    // failures arrive as AI_* API errors; anything else here is a tool
    // execute throwing (e.g. the FHIR backend rejecting a call), where the
    // real message is short and worth showing.
    onError: (error) => {
      console.error("Chat stream error:", error);
      const err = error instanceof Error ? error : new Error(String(error));
      // Gateway errors carry a symbol marker instead of an AI_* name (the
      // base GatewayError never sets .name), so duck-type on the marker.
      const isGatewayError =
        typeof error === "object" &&
        error !== null &&
        Symbol.for("vercel.ai.gateway.error") in error;
      if (
        err.name === "AI_APICallError" ||
        err.name === "AI_RetryError" ||
        isGatewayError
      ) {
        return (
          "The model call failed. The demo may be over capacity right now; " +
          "please wait a minute and try again."
        );
      }
      const detail = (err.message || "unknown error").slice(0, 140);
      return `A chart request failed: ${detail}`;
    },
  });
}
