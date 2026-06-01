import "server-only";

import { createAI, getMutableAIState, streamUI } from "@ai-sdk/rsc";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { MedplumClient } from "@medplum/core";
import { cookies } from "next/headers";

import { BotCard, BotMessage, Patients, MessageSkeleton } from "@/components/chat";
import { PatientCard } from "@/components/chat/patient";

export type AIMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  name?: string;
};

const SYSTEM_PROMPT = `You are an EHR assistant. You answer every message by calling exactly one tool — never with plain text, and never by announcing what you are about to do.

Tools:
- search_patients: use when the user names a patient or wants to find or look up patients by name. Pass the name they mentioned.
- show_patient_info: use when the user wants to open or view a specific patient by id.

The tool renders the UI itself, so calling it IS your response. Call the tool immediately; never invent patient data or write status text.`;

async function getMedplumFromCookies(): Promise<MedplumClient | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("medplum_access_token");
  if (!accessToken) return null;
  return new MedplumClient({ accessToken: accessToken.value });
}

async function submitUserMessage(
  content: string,
): Promise<{ id: string; display: React.ReactNode }> {
  "use server";

  const aiState = getMutableAIState<typeof AI>();
  aiState.update([...aiState.get(), { role: "user", content }]);

  const result = await streamUI({
    model: openai("gpt-4.1-mini"),
    temperature: 0,
    toolChoice: "required",
    system: SYSTEM_PROMPT,
    messages: aiState
      .get()
      .map((m: AIMessage) => ({ role: m.role, content: m.content })),

    // Plain assistant text streaming (replaces the old onTextContent callback).
    text: ({ content, done }) => {
      if (done) {
        aiState.done([...aiState.get(), { role: "assistant", content }]);
      }
      return <BotMessage>{content}</BotMessage>;
    },

    tools: {
      search_patients: {
        description:
          "Show a list of patients. Use this when the user wants to search for a patient by name.",
        inputSchema: z.object({
          name: z.string().describe("The patient's name, e.g. John Doe."),
        }),
        generate: async function* ({ name }) {
          yield (
            <BotCard>
              <MessageSkeleton />
            </BotCard>
          );

          const medplum = await getMedplumFromCookies();
          if (!medplum) {
            aiState.done([
              ...aiState.get(),
              { role: "assistant", content: "[User is not signed in]" },
            ]);
            return <BotMessage>It looks like you&apos;re not signed in.</BotMessage>;
          }

          const bundle = await medplum.search("Patient", `name=${name}`);
          aiState.done([
            ...aiState.get(),
            { role: "assistant", content: `[Showed patient list for ${name}]` },
          ]);

          return (
            <>
              <BotMessage>
                Choose a patient from the list below to view their information.
              </BotMessage>
              <BotCard showAvatar={false}>
                <Patients patients={bundle.entry ?? []} />
              </BotCard>
            </>
          );
        },
      },

      show_patient_info: {
        description:
          "Show a patient's chart by id. Use this when the user wants to view a specific patient's details.",
        inputSchema: z.object({
          id: z.string().describe("The patient resource id."),
        }),
        generate: async function* ({ id }) {
          yield (
            <BotCard>
              <MessageSkeleton />
            </BotCard>
          );

          const medplum = await getMedplumFromCookies();
          if (!medplum) {
            aiState.done([
              ...aiState.get(),
              { role: "assistant", content: "[User is not signed in]" },
            ]);
            return <BotMessage>It looks like you&apos;re not signed in.</BotMessage>;
          }

          const patient = await medplum.readResource("Patient", id);
          aiState.done([
            ...aiState.get(),
            { role: "assistant", content: `[Showed patient ${id}]` },
          ]);

          return (
            <>
              <BotMessage>
                Here is the information for the patient you requested.
              </BotMessage>
              <BotCard showAvatar={false}>
                <PatientCard patient={patient} />
              </BotCard>
            </>
          );
        },
      },
    },
  });

  return { id: crypto.randomUUID(), display: result.value };
}

const initialAIState: AIMessage[] = [];
const initialUIState: { id: string; display: React.ReactNode }[] = [];

export const AI = createAI({
  actions: { submitUserMessage },
  initialUIState,
  initialAIState,
});
