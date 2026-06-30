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

  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: getChatModel(),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: buildTools(accessToken),
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
