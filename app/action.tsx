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

const SYSTEM_PROMPT = `You are an EHR assistant bot and you can help users look up information about patients.
You and the user can discuss information in a patient's chart, and the user can specify which patient to look up.

Messages inside [] mean that it is a UI element or a user event. For example:
- "[Showed patient list for John Doe]" means a list of matching patients is shown to the user.
- "[Showed patient 123]" means the patient with id 123 is shown to the user.

If the user asks to look up a patient by name, call \`search_patients\` to show a list of matching patients.
If the user asks to view a patient by id, call \`show_patient_info\` to show that patient's chart.
If the user asks to do something impossible, respond that you are a demo and cannot do that.

Otherwise, just chat with the user.`;

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
    model: openai("gpt-4o-mini"),
    temperature: 0,
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
