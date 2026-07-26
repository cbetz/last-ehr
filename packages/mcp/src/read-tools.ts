import type {
  Bundle,
  ExtractResource,
  ResourceType,
} from "@medplum/fhirtypes";
import { z } from "zod";

import { createChartReader } from "./chart-read.js";

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
  name:
    | "search_patients"
    | "show_patient_info"
    | "read_chart_section"
    | "read_document";
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

/**
 * The package's chart reads, all four of them, built on the SAME core the web
 * agent uses (./chart-read.js). That is the point: the honesty properties there
 * — truncation measured at the server window, a coded miss reported as
 * unmatched rather than absent, a refused filter refused with its legal values,
 * document bodies decoded but never fetched from a URL, and every free-text
 * value inside the <chart_text> boundary — each came from a real false negative
 * found against a live FHIR server. A second implementation here would have
 * re-earned all of them, and this is the copy people install.
 *
 * No sessionId is passed: a stdio server is one operator against their own
 * FHIR server, so the demo's per-visitor tag filtering has nothing to isolate
 * and short-circuits.
 *
 * The configured backend still governs which records these requests can return
 * (a Medplum access policy, or the local no-auth evaluation stack's
 * everything); this MCP server never implements authorization itself.
 */
export function createReadTools(client: FhirReadClient): McpReadTool[] {
  const reader = createChartReader(client);
  return [
    {
      name: "search_patients",
      description:
        "Search patients by name. This tool is read-only and returns only records the configured FHIR backend allows.",
      inputSchema: searchPatientsSchema,
      async execute(input: unknown) {
        const { name } = searchPatientsSchema.parse(input);
        const bundle = await client.search("Patient", { name, _count: "20" });
        const entries = bundle.entry ?? [];
        if (entries.length > 0) return { patients: entries };
        // R4 defines `name` as matching any PART of a HumanName, and servers
        // differ on whether a multi-word value is matched as a whole string.
        // Probed on HAPI: "Maria Garcia" answers 0 while either word answers 1,
        // so asking by full name — which this description invites — would say
        // the patient is not in the system.
        const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 3);
        if (words.length < 2) return { patients: entries };
        const perWord = await Promise.all(
          words.map((word) => client.search("Patient", { name: word, _count: "20" })),
        );
        const hits = new Map<string, number>();
        const byId = new Map<string, (typeof entries)[number]>();
        for (const result of perWord) {
          const seen = new Set<string>();
          for (const entry of result.entry ?? []) {
            const id = entry.resource?.id;
            if (!id || seen.has(id)) continue;
            seen.add(id);
            hits.set(id, (hits.get(id) ?? 0) + 1);
            byId.set(id, entry);
          }
        }
        // Only patients matching EVERY word, so the retry cannot widen
        // "Maria Garcia" into "anyone named Maria or Garcia".
        return {
          patients: [...hits.entries()]
            .filter(([, count]) => count === words.length)
            .flatMap(([id]) => {
              const entry = byId.get(id);
              return entry ? [entry] : [];
            }),
        };
      },
    },
    {
      name: "show_patient_info",
      description: reader.patientChartDescription,
      inputSchema: reader.patientChartInputSchema,
      execute: (input: unknown) =>
        reader.readPatientChart(reader.patientChartInputSchema.parse(input)),
    },
    {
      name: "read_chart_section",
      description: reader.sectionDescription,
      inputSchema: reader.sectionInputSchema,
      execute: (input: unknown) =>
        reader.readChartSection(reader.sectionInputSchema.parse(input)),
    },
    {
      name: "read_document",
      description: reader.documentDescription,
      inputSchema: reader.documentInputSchema,
      execute: (input: unknown) =>
        reader.readDocument(reader.documentInputSchema.parse(input)),
    },
  ];
}
