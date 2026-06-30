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

const SYSTEM_PROMPT = `You are an EHR assistant working over a FHIR backend.

Reading the chart:
- Use search_patients to find patients by name.
- Use show_patient_info to load a specific patient's chart by id.

Writing to the chart (these save to the patient's record):
- Use add_note to add a free-text note.
- Use record_observation to record a vital sign or lab value (a label, a numeric value, and a unit).

Always reference a patient by the resource id from a prior search. Writes require the user to approve before anything is saved — propose the write and the user will be asked to confirm. The UI renders tool results, so keep any accompanying text to a short sentence. Never invent patient data.`;

function buildTools(accessToken: string) {
  // baseUrl lets self-hosters point at their own Medplum; falls back to
  // Medplum's hosted API (api.medplum.com) when unset.
  const medplum = new MedplumClient({
    accessToken,
    baseUrl: process.env.MEDPLUM_BASE_URL || undefined,
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
    add_note: tool({
      description:
        "Add a free-text clinical note to a patient's chart. Requires user approval before saving. Use the patient's resource id from a prior search.",
      inputSchema: z.object({
        patientId: z.string().describe("The patient resource id."),
        text: z.string().describe("The note text to add to the chart."),
      }),
      needsApproval: true,
      execute: async ({ patientId, text }) => {
        const created = await medplum.createResource({
          resourceType: "Communication",
          status: "completed",
          subject: { reference: `Patient/${patientId}` },
          sent: new Date().toISOString(),
          payload: [{ contentString: text }],
        });
        return {
          id: created.id,
          resourceType: "Communication",
          summary: text,
        };
      },
    }),
    record_observation: tool({
      description:
        "Record a clinical observation (a vital sign or lab value) on a patient's chart. Requires user approval before saving. Use the patient's resource id from a prior search.",
      inputSchema: z.object({
        patientId: z.string().describe("The patient resource id."),
        label: z
          .string()
          .describe(
            "What is being measured, e.g. 'Systolic blood pressure' or 'Body weight'.",
          ),
        value: z.number().describe("The numeric value."),
        unit: z.string().describe("The unit, e.g. 'mmHg', 'kg', 'bpm'."),
      }),
      needsApproval: true,
      execute: async ({ patientId, label, value, unit }) => {
        const created = await medplum.createResource({
          resourceType: "Observation",
          status: "final",
          code: { text: label },
          subject: { reference: `Patient/${patientId}` },
          effectiveDateTime: new Date().toISOString(),
          valueQuantity: {
            value,
            unit,
            system: "http://unitsofmeasure.org",
            code: unit,
          },
        });
        return {
          id: created.id,
          resourceType: "Observation",
          summary: `${label}: ${value} ${unit}`,
        };
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
