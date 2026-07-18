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
      patients: Array<{ resource?: { id?: string } }>;
    };
    expect(searchPayload.patients.length).toBeGreaterThan(0);
    const patientId = searchPayload.patients[0]?.resource?.id;
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
