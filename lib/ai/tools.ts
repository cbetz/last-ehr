import { tool, type ToolSet } from "ai";
import { MedplumClient } from "@medplum/core";
import { z } from "zod";

export const SYSTEM_PROMPT = `You are an EHR assistant working over a FHIR backend.

Reading the chart:
- Use search_patients to find patients by name. After a search, present the results and STOP — do not automatically open a chart. The user opens a patient's full record themselves (the search results have a "View record" button).
- Use show_patient_info ONLY when the user explicitly asks to view a specific patient's record or chart (for example "Show patient info for id ...").

Writing to the chart (these save to the patient's record):
- Use add_note to add a free-text note.
- Use record_observation to record a vital sign or lab value (a label, a numeric value, and a unit).

Always reference a patient by the resource id from a prior search. Writes require the user to approve before anything is saved — propose the write and the user will be asked to confirm. The UI renders tool results, so keep any accompanying text to a short sentence. Never invent patient data.`;

// Builds the agent's FHIR tools, scoped to one Medplum session (accessToken).
// Read tools (search/show) execute freely; write tools (add_note,
// record_observation) set needsApproval so the SDK gates them behind explicit
// user approval before execute runs.
export function buildTools(accessToken: string) {
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
        // Fetch the patient plus the related resources the chart shows, so the
        // UI renders the patient's actual data (not placeholders).
        const [patient, conditions, allergies, observations, notes] =
          await Promise.all([
            medplum.readResource("Patient", id),
            medplum.searchResources("Condition", { patient: id, _count: "50" }),
            medplum.searchResources("AllergyIntolerance", {
              patient: id,
              _count: "50",
            }),
            medplum.searchResources("Observation", {
              patient: id,
              _sort: "-date",
              _count: "50",
            }),
            medplum.searchResources("Communication", {
              subject: `Patient/${id}`,
              _sort: "-sent",
              _count: "20",
            }),
          ]);

        return {
          patient,
          conditions: conditions.map((c) => ({
            id: c.id ?? "",
            text: c.code?.text ?? c.code?.coding?.[0]?.display ?? "Condition",
          })),
          allergies: allergies.map((a) => ({
            id: a.id ?? "",
            text: a.code?.text ?? a.code?.coding?.[0]?.display ?? "Allergy",
          })),
          observations: observations.map((o) => ({
            id: o.id ?? "",
            label: o.code?.text ?? o.code?.coding?.[0]?.display ?? "Observation",
            value: o.valueQuantity
              ? `${o.valueQuantity.value ?? ""} ${o.valueQuantity.unit ?? ""}`.trim()
              : (o.valueString ?? ""),
            date: o.effectiveDateTime?.slice(0, 10) ?? "",
          })),
          notes: notes.map((n) => ({
            id: n.id ?? "",
            text: n.payload?.find((p) => p.contentString)?.contentString ?? "",
            date: n.sent?.slice(0, 10) ?? "",
          })),
        };
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
