import {
  streamText,
  tool,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
  type InferUITools,
  type UIDataTypes,
  type ToolSet,
} from "ai";
import { cookies } from "next/headers";
import { MedplumClient } from "@medplum/core";
import { z } from "zod";

import { getChatModel } from "@/lib/ai/model";

// Node runtime so @medplum/core works; allow time for the multi-step tool loop.
export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM_PROMPT = `You are an EHR assistant. Help users look up patient information.

- Use the search_patients tool to find patients by name.
- Use the show_patient_info tool to load a specific patient's chart by id.

Call a tool to fulfill any lookup request — the UI renders the results for the user, so keep any accompanying text to a short sentence. Never invent patient data.`;

function buildTools(accessToken: string) {
  // baseUrl lets self-hosters point at their own Medplum; falls back to
  // Medplum's hosted API (api.medplum.com) when unset.
  const medplum = new MedplumClient({
    accessToken,
    baseUrl: process.env.MEDPLUM_BASE_URL,
  });
  return {
    search_patients: tool({
      description:
        "Search for patients by name. Use whenever the user wants to find or look up a patient.",
      inputSchema: z.object({
        name: z.string().describe("The patient's name, e.g. John Doe."),
      }),
      execute: async ({ name }) => {
        const bundle = await medplum.search("Patient", `name=${name}`);
        return { patients: bundle.entry ?? [] };
      },
    }),
    show_patient_info: tool({
      description:
        "Show one patient's chart by id. Use when the user wants to view a specific patient's details.",
      inputSchema: z.object({
        id: z.string().describe("The patient resource id."),
      }),
      execute: async ({ id }) => {
        const patient = await medplum.readResource("Patient", id);
        return { patient };
      },
    }),
  } satisfies ToolSet;
}

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
