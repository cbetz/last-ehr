import { describe, expect, it, vi } from "vitest";

import {
  createReadTools,
  type MedplumReadClient,
} from "./read-tools.js";
import { createChartReader } from "./chart-read.js";
import { buildInstructions, callMcpTool, listMcpTools } from "./server.js";

function createClient(): MedplumReadClient {
  return {
    search: vi.fn().mockResolvedValue({ entry: [] }),
    searchResources: vi.fn().mockImplementation(async (resourceType) => {
      if (resourceType === "Patient") {
        return [{ resourceType: "Patient", id: "patient-1", name: [] }];
      }
      return [];
    }),
  } as unknown as MedplumReadClient;
}

describe("read-only MCP tools", () => {
  it("exposes the four read tools, all annotated read-only", () => {
    const definitions = listMcpTools(createReadTools(createClient()));

    // read_chart_section and read_document are the same implementations the web
    // agent uses (./chart-read.ts), so the published package reads the chart as
    // broadly as the demo does rather than offering a narrower surface.
    expect(definitions.map((tool) => tool.name)).toEqual([
      "search_patients",
      "show_patient_info",
      "read_chart_section",
      "read_document",
    ]);
    expect(definitions.every((tool) => tool.annotations.readOnlyHint)).toBe(true);
  });

  it("tells the client the truth about the write policy", async () => {
    // The default said "Read-only FHIR chart tools" even when the server was
    // offering four write proposals, because startMcpServer never overrode it.
    expect(buildInstructions(false)).toContain("Read-only FHIR chart tools");
    expect(buildInstructions(true)).not.toContain("Read-only FHIR chart tools");
    expect(buildInstructions(true)).toContain("a human approves");

    for (const offersWrites of [false, true]) {
      const text = buildInstructions(offersWrites);
      // The general rule must stand on its own: search_patients returns whole
      // Patient resources, unwrapped, so a tag-first framing would imply
      // anything unwrapped is safe to act on.
      const rule = text.indexOf("never instruction");
      const tag = text.indexOf("<chart_text>");
      expect(rule).toBeGreaterThan(-1);
      expect(tag).toBeGreaterThan(rule);
      // The honesty flags are meaningless if their meaning is never stated.
      for (const flag of ["truncated", "codeFilterUnmatched", "includeUnsupported", "unreadable"]) {
        expect(text, `${flag} unexplained`).toContain(flag);
      }
    }
  });

  it("never hands the backend host or identifiers to the caller", async () => {
    // A raw Bundle.entry carries fullUrl, which is the backend host. The dev
    // panel has always been forbidden from exposing hosts; this path was
    // handing one to an MCP client's model as well, along with meta (whose
    // tags carry the demo session token), identifiers, address and telecom.
    const leaky = {
      search: async () => ({
        entry: [
          {
            fullUrl: "https://fhir.internal.example/fhir/Patient/2463",
            resource: {
              resourceType: "Patient",
              id: "2463",
              name: [{ given: ["Maria"], family: "Garcia" }],
              birthDate: "2001-07-30",
              identifier: [{ system: "urn:mrn", value: "MRN-000123" }],
              address: [{ line: ["12 Elm St"], city: "Springfield" }],
              telecom: [{ system: "phone", value: "555-0100" }],
              meta: { versionId: "7", tag: [{ system: "http://lastehr.demo", code: "session-SECRET" }] },
            },
          },
        ],
      }),
      searchResources: async () => [],
    } as unknown as MedplumReadClient;

    const result = await callMcpTool(createReadTools(leaky), "search_patients", {
      name: "Garcia",
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;

    for (const leak of [
      "fhir.internal.example",
      "fullUrl",
      "MRN-000123",
      "Elm St",
      "555-0100",
      "session-SECRET",
      "versionId",
    ]) {
      expect(text, `${leak} reached the caller`).not.toContain(leak);
    }
    // And the useful part survives, inside the boundary.
    const payload = JSON.parse(text) as {
      patients: Array<{ id: string; name: string; birthDate?: string }>;
    };
    expect(payload.patients).toEqual([
      {
        id: "2463",
        name: "<chart_text>Garcia, Maria</chart_text>",
        birthDate: "2001-07-30",
      },
    ]);
  });

  it("passes a refusal of the model's own input through verbatim", async () => {
    // The transport scrubs backend errors on purpose (a FHIR server can put
    // resource fragments in one). But the read core's refusals are static
    // strings that exist to be READ: each names the legal values so the caller
    // corrects itself. Scrubbed, a model is told to check its access policy
    // when the real answer is "Task has no status 'active'".
    const tools = createReadTools(createClient());

    const badStatus = await callMcpTool(tools, "read_chart_section", {
      patientId: "p1",
      resourceType: "Task",
      status: "active",
    });
    expect(badStatus.isError).toBe(true);
    expect(badStatus.content[0].text).toContain("is not a status Task can have");
    expect(badStatus.content[0].text).toContain("requested");
    expect(badStatus.content[0].text).not.toContain("access policy");

    const badSection = await callMcpTool(tools, "read_chart_section", {
      patientId: "p1",
      resourceType: "Observation",
      dateFrom: "2020-01-01",
      include: "nonsense",
    });
    expect(badSection.isError).toBe(true);
    expect(badSection.content[0].text).not.toContain("access policy");
  });

  it("still scrubs a backend error, which may carry resource detail", async () => {
    const exploding = {
      search: async () => {
        throw new Error("HAPI-1234: patient 2463 at http://internal:8080 says no");
      },
      searchResources: async () => {
        throw new Error("HAPI-1234: patient 2463 at http://internal:8080 says no");
      },
    } as unknown as MedplumReadClient;

    const result = await callMcpTool(createReadTools(exploding), "read_chart_section", {
      patientId: "p1",
      resourceType: "Observation",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain("HAPI-1234");
    expect(result.content[0].text).not.toContain("internal:8080");
    expect(result.content[0].text).toContain("could not be completed");
  });

  it("offers every section the shared reader knows, so the two surfaces cannot drift", () => {
    // The web agent's section allowlist and this one are the same object. If a
    // section were added to the core and this list did not grow, the published
    // package would silently be the narrower surface.
    const definitions = listMcpTools(createReadTools(createClient()));
    const section = definitions.find((tool) => tool.name === "read_chart_section");
    const offered = (
      section?.inputSchema as {
        properties?: { resourceType?: { enum?: string[] } };
      }
    ).properties?.resourceType?.enum;

    const shared = createChartReader(createClient()).sectionTypes;
    expect(offered?.slice().sort()).toEqual(shared.slice().sort());
    expect(offered?.length).toBeGreaterThanOrEqual(23);
  });

  it.each(["add_note", "record_observation"])(
    "does not recognize the historical write tool %s",
    async (name) => {
      const result = await callMcpTool(
        createReadTools(createClient()),
        name,
        {},
      );

      expect(result).toEqual({
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      });
    },
  );

  it("searches through Medplum with structured parameters", async () => {
    const client = createClient();
    const result = await callMcpTool(
      createReadTools(client),
      "search_patients",
      { name: "Smith & Jones" },
    );

    expect(client.search).toHaveBeenCalledWith("Patient", {
      name: "Smith & Jones",
      _count: "20",
    });
    expect(result.isError).toBeUndefined();
  });
});
