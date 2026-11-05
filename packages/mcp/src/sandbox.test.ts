import { exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it, vi } from "vitest";

import { loadMcpConfig } from "./config.js";
import { runDoctor } from "./doctor.js";
import { renderInit, sandboxGuide } from "./init.js";
import { runSandboxDoctor } from "./sandbox-doctor.js";
import {
  createWriteTools,
  MCP_WRITE_TAG,
  writeToolOptionsFromConfig,
  type FhirWriteClient,
} from "./write-tools.js";
import { EPIC_VENDOR_PROFILE, ORACLE_VENDOR_PROFILE } from "./sandbox-profile.js";

const pemPromise = generateKeyPair("RS384", { extractable: true }).then(({ privateKey }) =>
  exportPKCS8(privateKey),
);

describe("sandbox MCP configuration", () => {
  it("stays off without the experimental flag and accepts epic with a key", async () => {
    const pem = await pemPromise;
    expect(() =>
      loadMcpConfig({ LASTEHR_BACKEND: "epic", LASTEHR_CLIENT_ID: "c", LASTEHR_PRIVATE_KEY: pem }),
    ).toThrow(/LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS/);
    const config = loadMcpConfig({
      LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
      LASTEHR_BACKEND: "epic",
      LASTEHR_CLIENT_ID: "client",
      LASTEHR_PRIVATE_KEY: pem,
      LASTEHR_ENCOUNTER: "Encounter/enc-1",
    });
    expect(config.backend).toBe("epic");
    expect(config.sandbox?.profile).toBe("epic");
    expect(JSON.stringify({ backend: config.backend })).not.toContain("BEGIN PRIVATE KEY");
  });

  it("requires Oracle scopes", () => {
    expect(() =>
      loadMcpConfig({
        LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
        LASTEHR_BACKEND: "oracle",
        LASTEHR_CLIENT_ID: "client",
        LASTEHR_PRIVATE_KEY: "not-parsed-yet",
      }),
    ).toThrow(/LASTEHR_SCOPES/);
  });
});

describe("sandbox init", () => {
  it("prints placeholder env and keeps the JSON free of secrets", () => {
    const raw = renderInit("json", "epic");
    const config = JSON.parse(raw);
    expect(config.mcpServers.lastehr.env.LASTEHR_BACKEND).toBe("epic");
    expect(config.mcpServers.lastehr.env.LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS).toBe("1");
    expect(config.mcpServers.lastehr.env.LASTEHR_PRIVATE_KEY_PATH).toBe("<path-to-pkcs8-pem>");
    expect(config.mcpServers.lastehr.env.LASTEHR_MCP_WRITES).toBe("proposal");
    expect(raw).not.toContain("BEGIN PRIVATE KEY");
    expect(sandboxGuide("epic")).toContain("do not support delete");
    expect(sandboxGuide("oracle")).toContain("8331-1");
  });
});

describe("sandbox doctor", () => {
  it("reports kid, granted scopes, and a missing search scope without secrets", async () => {
    const pem = await pemPromise;
    const token = "minted-access-token-do-not-print";
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("jwks")) {
        return new Response(
          JSON.stringify({ keys: [{ kty: "RSA", kid: "lastehr-epic-1", n: "secret-modulus", e: "AQAB" }] }),
          { status: 200 },
        );
      }
      if (url.endsWith("/token")) {
        return new Response(
          JSON.stringify({
            access_token: token,
            expires_in: 300,
            scope: "system/Patient.read system/Observation.write",
          }),
          { status: 200 },
        );
      }
      return new Response("", { status: 403 });
    });
    const config = loadMcpConfig({
      LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
      LASTEHR_BACKEND: "epic",
      LASTEHR_CLIENT_ID: "client",
      LASTEHR_PRIVATE_KEY: pem,
      LASTEHR_KEY_ID: "lastehr-epic-1",
      LASTEHR_JWKS_URL: "https://www.example.test/.well-known/jwks.json",
      LASTEHR_FHIR_BASE_URL: "https://fhir.example.test/R4",
      LASTEHR_TOKEN_URL: "https://auth.example.test/token",
    });
    const report = await runDoctor(config, { fetchFn: fetchFn as typeof globalThis.fetch });
    const text = report.lines.join("\n");
    expect(report.ok).toBe(true);
    expect(text).toContain("Private key loaded");
    expect(text).toContain("JWKS kid matches.");
    expect(text).toContain("Granted scopes: system/Patient.read system/Observation.write.");
    expect(text).toContain("lacks the search scope");
    expect(text).not.toContain(token);
    expect(text).not.toContain(pem);
    expect(text).not.toContain("secret-modulus");
  });

  it("searches Patient by _id when LASTEHR_PATIENT_ID is set", async () => {
    const patientId = "patient-id-do-not-print";
    const token = "oracle-token-do-not-print";
    const fetchFn = vi.fn(async (_input: RequestInfo | URL) => new Response("", { status: 200 }));
    const config = loadMcpConfig({
      LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
      LASTEHR_BACKEND: "oracle",
      LASTEHR_ACCESS_TOKEN: token,
      LASTEHR_PATIENT_ID: patientId,
      LASTEHR_FHIR_BASE_URL: "https://fhir.example.test/r4",
      LASTEHR_TOKEN_URL: "https://auth.example.test/token",
    });
    const report = await runSandboxDoctor(config.sandbox!, fetchFn as typeof globalThis.fetch);
    const searched = String(fetchFn.mock.calls[0]?.[0]);
    expect(searched).toBe(`https://fhir.example.test/r4/Patient?_id=${patientId}`);
    expect(searched).not.toContain("_count");
    expect(report.ok).toBe(true);
    expect(report.lines.join("\n")).toContain("Patient search by id is allowed");
    expect(report.lines.join("\n")).not.toContain(patientId);
    expect(report.lines.join("\n")).not.toContain(token);
  });

  it("treats HTTP 400 on an unparameterized Patient search as a soft pass", async () => {
    const token = "oracle-token-do-not-print";
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://fhir.example.test/r4/Patient?_count=1");
      return new Response(
        JSON.stringify({
          resourceType: "OperationOutcome",
          issue: [{ diagnostics: "secret-search-diagnostic" }],
        }),
        { status: 400 },
      );
    });
    const config = loadMcpConfig({
      LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
      LASTEHR_BACKEND: "oracle",
      LASTEHR_ACCESS_TOKEN: token,
      LASTEHR_FHIR_BASE_URL: "https://fhir.example.test/r4",
      LASTEHR_TOKEN_URL: "https://auth.example.test/token",
    });
    const report = await runSandboxDoctor(config.sandbox!, fetchFn as typeof globalThis.fetch);
    expect(report.ok).toBe(true);
    expect(report.lines.join("\n")).toContain("HTTP 400");
    expect(report.lines.join("\n")).not.toContain("secret-search-diagnostic");
    expect(report.lines.join("\n")).not.toContain(token);
  });

  it("still fails a parameterized Patient search that returns HTTP 400", async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL) => new Response("", { status: 400 }));
    const config = loadMcpConfig({
      LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
      LASTEHR_BACKEND: "oracle",
      LASTEHR_ACCESS_TOKEN: "token",
      LASTEHR_PATIENT_ID: "12724066",
      LASTEHR_FHIR_BASE_URL: "https://fhir.example.test/r4",
      LASTEHR_TOKEN_URL: "https://auth.example.test/token",
    });
    const report = await runSandboxDoctor(config.sandbox!, fetchFn as typeof globalThis.fetch);
    expect(report.ok).toBe(false);
    expect(report.lines.join("\n")).toContain("HTTP 400");
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain("_id=12724066");
  });
});

describe("sandbox write approval", () => {
  it("refuses an Epic observation before asking for approval when encounter is missing", async () => {
    const decide = vi.fn(async () => "approved" as const);
    const createResource = vi.fn();
    const tools = createWriteTools(
      { search: vi.fn(), searchResources: vi.fn(), createResource },
      decide,
      { vendor: EPIC_VENDOR_PROFILE },
    );
    const tool = tools.find((candidate) => candidate.name === "record_observation");
    const result = await tool?.execute({
      patientId: "p1",
      label: "Heart rate",
      value: 72,
      unit: "bpm",
    });
    expect(result).toMatchObject({ saved: false });
    expect(JSON.stringify(result)).toContain("Encounter");
    expect(decide).not.toHaveBeenCalled();
    expect(createResource).not.toHaveBeenCalled();
  });

  it("posts Epic and Oracle observation bodies in the shape the sandboxes accepted", async () => {
    const post = async (
      options: Parameters<typeof createWriteTools>[2],
      input: Record<string, unknown>,
    ) => {
      const posted: unknown[] = [];
      const createResource: FhirWriteClient["createResource"] = async (resource) => {
        const stored = { ...resource, id: "created-1" };
        posted.push(stored);
        return stored;
      };
      const tools = createWriteTools(
        { search: vi.fn(), searchResources: vi.fn(), createResource },
        async () => "approved",
        options,
      );
      const tool = tools.find((candidate) => candidate.name === "record_observation");
      const result = await tool?.execute(input);
      expect(result).toMatchObject({ saved: true, id: "created-1" });
      return posted[0] as {
        valueQuantity?: { value?: number; unit?: string; code?: string; system?: string };
        encounter?: { reference?: string };
        performer?: Array<{
          reference?: string;
          extension?: Array<{
            url?: string;
            valueCodeableConcept?: { coding?: Array<{ code?: string }> };
          }>;
        }>;
        meta?: { tag?: Array<{ system?: string; code?: string }> };
      };
    };

    const epic = await post(
      { vendor: EPIC_VENDOR_PROFILE, encounter: "Encounter/eMT95RPaM-HxLc3NeIA5qlQ3" },
      { patientId: "erXuFYUfucBZaryVksYEcMg3", label: "Heart rate", value: 72, unit: "bpm" },
    );
    expect(epic.valueQuantity).toEqual({
      value: 72,
      unit: "/min",
      system: "http://unitsofmeasure.org",
      code: "/min",
    });
    expect(epic.encounter?.reference).toBe("Encounter/eMT95RPaM-HxLc3NeIA5qlQ3");

    const oracle = await post(
      {
        vendor: ORACLE_VENDOR_PROFILE,
        encounter: "Encounter/97954294",
        performer: "Practitioner/12724064",
      },
      { patientId: "12724066", label: "oral temperature", value: 37, unit: "Cel" },
    );
    expect(oracle.valueQuantity).toEqual({
      value: 37,
      unit: "degC",
      system: "http://unitsofmeasure.org",
      code: "Cel",
    });
    expect(oracle.encounter?.reference).toBe("Encounter/97954294");
    expect(oracle.performer?.[0]?.reference).toBe("Practitioner/12724064");
    expect(oracle.performer?.[0]?.extension?.[0]?.url).toBe(
      "http://hl7.org/fhir/StructureDefinition/event-performerFunction",
    );
    expect(oracle.performer?.[0]?.extension?.[0]?.valueCodeableConcept?.coding?.[0]?.code).toBe(
      "LA",
    );
    expect(oracle.meta?.tag).toBeUndefined();

    const tagged = await post(
      {
        vendor: ORACLE_VENDOR_PROFILE,
        performer: "12724064",
        includeMetaTag: true,
      },
      { patientId: "12724066", label: "oral temperature", value: 37, unit: "degC" },
    );
    expect(tagged.valueQuantity?.unit).toBe("degC");
    expect(tagged.valueQuantity?.code).toBe("Cel");
    expect(tagged.encounter).toBeUndefined();
    expect(tagged.meta?.tag).toEqual([MCP_WRITE_TAG]);
  });

  it("keeps Oracle meta.tag only when LASTEHR_INCLUDE_META_TAG is set", () => {
    const config = loadMcpConfig({
      LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
      LASTEHR_BACKEND: "oracle",
      LASTEHR_ACCESS_TOKEN: "token",
      LASTEHR_INCLUDE_META_TAG: "1",
      LASTEHR_FHIR_BASE_URL: "https://fhir.example.test/r4",
      LASTEHR_TOKEN_URL: "https://auth.example.test/token",
    });
    expect(writeToolOptionsFromConfig(config).includeMetaTag).toBe(true);
    const off = loadMcpConfig({
      LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
      LASTEHR_BACKEND: "oracle",
      LASTEHR_ACCESS_TOKEN: "token",
      LASTEHR_FHIR_BASE_URL: "https://fhir.example.test/r4",
      LASTEHR_TOKEN_URL: "https://auth.example.test/token",
    });
    expect(writeToolOptionsFromConfig(off).includeMetaTag).toBeUndefined();
  });
});
