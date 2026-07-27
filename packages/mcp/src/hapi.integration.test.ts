import { describe, expect, it } from "vitest";

import { loadMcpConfig } from "./config.js";
import { HapiReadClient } from "./hapi.js";
import { callMcpTool } from "./server.js";
import { createReadTools } from "./read-tools.js";

// Opt-in integration for the published package's FHIR_BACKEND=hapi mode
// against the repository's seeded local stack (CI's local-hapi job runs it;
// locally: npm run demo:local:prepare first). Read-only by construction.
const runHapiE2E = process.env.RUN_HAPI_E2E === "1";

(runHapiE2E ? describe : describe.skip)("@lastehr/mcp hapi mode", () => {
  const env = {
    FHIR_BACKEND: "hapi",
    FHIR_BASE_URL: process.env.FHIR_BASE_URL ?? "http://localhost:8080/fhir",
  };

  it("serves the section and document reads, with the honesty flags intact", async () => {
    // The point of sharing the read core is that the PUBLISHED package carries
    // the same false-negative protections the web agent does. This asserts them
    // through the MCP call layer against a live server, not through the core
    // directly, because JSON-stringifying the result is where they could be
    // dropped.
    const config = loadMcpConfig(env);
    const tools = createReadTools(new HapiReadClient(config.baseUrl as string));

    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await callMcpTool(tools, name, args);
      expect(result.isError, `${name} errored: ${result.content[0]?.text}`).toBeFalsy();
      return JSON.parse(result.content[0].text) as Record<string, unknown>;
    };

    const found = await call("search_patients", { name: "Maria Garcia" });
    const patientId = (
      found.patients as Array<{ id?: string }>
    )[0]?.id;
    expect(patientId, "full-name search found nobody").toBeTruthy();

    // A coded miss must report codeFilterUnmatched, never read as an absence:
    // the seeded immunizations carry no CVX coding at all.
    const codedMiss = await call("read_chart_section", {
      patientId,
      resourceType: "Immunization",
      code: "88",
    });
    expect(codedMiss.entries).toEqual([]);
    expect(codedMiss.codeFilterUnmatched).toBe(true);

    // A measurement NAME resolves to codes here too, so an MCP client never has
    // to recall LOINC.
    const bp = await call("read_chart_section", {
      patientId,
      resourceType: "Observation",
      measurement: "blood pressure",
    });
    expect((bp.entries as unknown[]).length).toBeGreaterThan(0);

    // Free text arrives inside the boundary, which the package's old
    // hand-rolled show_patient_info never applied to anything.
    const chart = await call("show_patient_info", { id: patientId });
    const conditions = chart.conditions as Array<{ text: string }>;
    expect(conditions.length).toBeGreaterThan(0);
    expect(conditions[0].text).toMatch(/^<chart_text>/);

    // Documents: one body readable, and the pointer-only PDF reported as unread
    // rather than empty.
    const documents = await call("read_chart_section", {
      patientId,
      resourceType: "DocumentReference",
    });
    const ids = (documents.entries as Array<{ id: string }>).map((e) => e.id);
    expect(ids.length).toBeGreaterThan(0);

    const bodies = await Promise.all(
      ids.map((documentId) => call("read_document", { patientId, documentId })),
    );
    expect(bodies.some((b) => typeof b.text === "string")).toBe(true);
    for (const body of bodies.filter((b) => !b.text)) {
      expect(body.unreadable, "an unread document gave no reason").toBeTruthy();
    }
  });

  it("serves both read tools over the local stack end to end", async () => {
    const config = loadMcpConfig(env);
    const tools = createReadTools(
      new HapiReadClient(config.baseUrl as string),
    );

    const search = await callMcpTool(tools, "search_patients", {
      name: "Garcia",
    });
    expect(search.isError).toBeFalsy();
    const searchPayload = JSON.parse(search.content[0].text) as {
      patients: Array<{ id?: string }>;
    };
    expect(searchPayload.patients.length).toBeGreaterThan(0);
    const patientId = searchPayload.patients[0]?.id;
    expect(patientId).toBeTruthy();

    const chart = await callMcpTool(tools, "show_patient_info", {
      id: patientId,
    });
    expect(chart.isError).toBeFalsy();
    const chartPayload = JSON.parse(chart.content[0].text) as {
      patient: { id?: string };
      observations: unknown[];
    };
    expect(chartPayload.patient.id).toBe(patientId);
    expect(Array.isArray(chartPayload.observations)).toBe(true);
  }, 30_000);
});
