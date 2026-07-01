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
import { checkRateLimit, getClientIp } from "@/lib/utils/rate-limit";

// Node runtime so @medplum/core works; allow time for the multi-step tool loop.
export const runtime = "nodejs";
export const maxDuration = 30;

export type ChatTools = InferUITools<ReturnType<typeof buildTools>>;
export type ChatMessage = UIMessage<never, UIDataTypes, ChatTools>;

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("medplum_access_token")?.value;
  if (!accessToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Protect the public demo from a traffic spike / abuse: cap requests per IP
  // (and globally, to bound model spend). See lib/utils/rate-limit.ts.
  const { success, resetAfter } = await checkRateLimit(getClientIp(req));
  if (!success) {
    const retryAfter = Math.max(1, Math.ceil(resetAfter / 1000));
    return new Response(
      "Rate limit exceeded — please slow down and try again shortly.",
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }

  // Tags demo writes so a visitor sees seed data + only their own edits.
  const sessionId = cookieStore.get("demo_session_id")?.value;

  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: getChatModel(),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: buildTools(accessToken, sessionId),
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
