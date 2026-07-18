import type {
  Bundle,
  ExtractResource,
  ResourceType,
} from "@medplum/fhirtypes";
import { z } from "zod";

export interface FhirReadClient {
  search<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<Bundle<ExtractResource<K>>>;
  searchResources<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<ExtractResource<K>[]>;
}

/** @deprecated Renamed to FhirReadClient when FHIR_BACKEND support landed. */
export type MedplumReadClient = FhirReadClient;

export type McpReadTool = {
  name: "search_patients" | "show_patient_info";
  description: string;
  inputSchema: z.ZodType;
  execute(input: unknown): Promise<unknown>;
};

const searchPatientsSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(120)
    .describe("The patient's name, for example John Doe."),
});

const showPatientInfoSchema = z.object({
  id: z.string().min(1).describe("The patient resource id."),
});

/**
 * The public package deliberately contains only chart-reading capabilities.
 * The configured backend still governs which records these requests can
 * return (a Medplum access policy, or the local no-auth evaluation stack's
 * everything); this MCP server never implements authorization itself.
 */
export function createReadTools(client: FhirReadClient): McpReadTool[] {
  return [
    {
      name: "search_patients",
      description:
        "Search patients by name. This tool is read-only and returns only records the configured FHIR backend allows.",
      inputSchema: searchPatientsSchema,
      async execute(input: unknown) {
        const { name } = searchPatientsSchema.parse(input);
        const bundle = await client.search("Patient", { name, _count: "20" });
        return { patients: bundle.entry ?? [] };
      },
    },
    {
      name: "show_patient_info",
      description:
        "Show a patient's chart by resource id. This tool is read-only and may return sensitive chart data the configured FHIR backend allows.",
      inputSchema: showPatientInfoSchema,
      async execute(input: unknown) {
        const { id } = showPatientInfoSchema.parse(input);
        const [
          patients,
          conditions,
          allergies,
          observations,
          notes,
          medications,
          immunizations,
        ] = await Promise.all([
          client.searchResources("Patient", { _id: id, _count: "1" }),
          client.searchResources("Condition", { patient: id, _count: "50" }),
          client.searchResources("AllergyIntolerance", {
            patient: id,
            _count: "50",
          }),
          client.searchResources("Observation", {
            patient: id,
            _sort: "-date",
            _count: "100",
          }),
          client.searchResources("Communication", {
            subject: `Patient/${id}`,
            _sort: "-sent",
            _count: "100",
          }),
          client.searchResources("MedicationRequest", {
            patient: id,
            _count: "50",
          }),
          client.searchResources("Immunization", {
            patient: id,
            _sort: "-date",
            _count: "50",
          }),
        ]);

        const patient = patients[0];
        if (!patient) {
          throw new Error("Patient not found or not accessible in this session.");
        }

        return {
          patient,
          conditions: conditions.map((condition) => ({
            id: condition.id ?? "",
            text:
              condition.code?.text ??
              condition.code?.coding?.[0]?.display ??
              "Condition",
          })),
          allergies: allergies.map((allergy) => ({
            id: allergy.id ?? "",
            text:
              allergy.code?.text ??
              allergy.code?.coding?.[0]?.display ??
              "Allergy",
          })),
          observations: observations.map((observation) => ({
            id: observation.id ?? "",
            label:
              observation.code?.text ??
              observation.code?.coding?.[0]?.display ??
              "Observation",
            value: observation.valueQuantity
              ? `${observation.valueQuantity.value ?? ""} ${observation.valueQuantity.unit ?? ""}`.trim()
              : (observation.valueString ?? ""),
            date: observation.effectiveDateTime?.slice(0, 10) ?? "",
          })),
          notes: notes.map((note) => ({
            id: note.id ?? "",
            text:
              note.payload?.find((payload) => payload.contentString)
                ?.contentString ?? "",
            date: note.sent?.slice(0, 10) ?? "",
          })),
          medications: medications.map((medication) => ({
            id: medication.id ?? "",
            text:
              medication.medicationCodeableConcept?.text ??
              medication.medicationCodeableConcept?.coding?.[0]?.display ??
              "Medication",
            dosage: medication.dosageInstruction?.[0]?.text ?? "",
            status: medication.status ?? "",
          })),
          immunizations: immunizations.map((immunization) => ({
            id: immunization.id ?? "",
            text:
              immunization.vaccineCode?.text ??
              immunization.vaccineCode?.coding?.[0]?.display ??
              "Immunization",
            date: immunization.occurrenceDateTime?.slice(0, 10) ?? "",
          })),
        };
      },
    },
  ];
}
