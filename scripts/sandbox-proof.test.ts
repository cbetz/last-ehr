import { exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import { runSandboxProof } from "./sandbox-proof";

describe("sandbox proof transcript", () => {
  it("approves one Epic observation and prints a read-back without secrets", async () => {
    const { privateKey } = await generateKeyPair("RS384", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const token = "minted-access-token-do-not-print";
    let posted = "";
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/token")) {
        return new Response(
          JSON.stringify({ access_token: token, expires_in: 300, scope: "system/Observation.write" }),
          { status: 200 },
        );
      }
      if (init?.method === "POST") {
        posted = String(init.body ?? "");
        return new Response(null, {
          status: 201,
          headers: {
            location:
              "https://fhir.example.test/R4/Observation/eQ36ru9st5pkcpWMMJBxjcxQNqRAVOaGy1aHFyggLA4VYxm5r2IvRWw96gM1SSwFs3",
          },
        });
      }
      const sent = JSON.parse(posted) as {
        code?: { coding?: Array<{ system?: string; code?: string }> };
      };
      return new Response(
        JSON.stringify({
          ...JSON.parse(posted),
          resourceType: "Observation",
          id: "eQ36ru9st5pkcpWMMJBxjcxQNqRAVOaGy1aHFyggLA4VYxm5r2IvRWw96gM1SSwFs3",
          code: {
            ...sent.code,
            coding: [
              ...(sent.code?.coding ?? []),
              { system: "http://loinc.org", code: "8716-3" },
            ],
          },
        }),
        { status: 200 },
      );
    };
    const result = await runSandboxProof(
      {
        LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
        LASTEHR_BACKEND: "epic",
        LASTEHR_MCP_WRITES: "proposal",
        LASTEHR_CLIENT_ID: "client",
        LASTEHR_PRIVATE_KEY: pem,
        LASTEHR_KEY_ID: "lastehr-epic-1",
        LASTEHR_ENCOUNTER: "Encounter/eMT95RPaM-HxLc3NeIA5qlQ3",
        LASTEHR_PATIENT_ID: "erXuFYUfucBZaryVksYEcMg3",
        LASTEHR_FHIR_BASE_URL: "https://fhir.example.test/R4",
        LASTEHR_TOKEN_URL: "https://auth.example.test/token",
      } as unknown as NodeJS.ProcessEnv,
      fetchFn as typeof globalThis.fetch,
    );
    expect(result.exitCode).toBe(0);
    expect(result.transcript).toContain("Decision: approved");
    expect(result.transcript).toContain("8");
    expect(result.transcript).toContain("8867-4");
    expect(result.transcript).toContain("Encounter/eMT95RPaM-HxLc3NeIA5qlQ3");
    expect(result.transcript).toContain(
      "Saved: Observation/eQ36ru9st5pkcpWMMJBxjcxQNqRAVOaGy1aHFyggLA4VYxm5r2IvRWw96gM1SSwFs3",
    );
    expect(result.transcript).toContain("Matches the approved write.");
    const body = JSON.parse(posted) as {
      valueQuantity?: { value?: number; unit?: string; code?: string; system?: string };
      encounter?: { reference?: string };
    };
    expect(body.valueQuantity).toEqual({
      value: 72,
      unit: "/min",
      system: "http://unitsofmeasure.org",
      code: "/min",
    });
    expect(body.encounter?.reference).toBe("Encounter/eMT95RPaM-HxLc3NeIA5qlQ3");
    expect(result.transcript).not.toContain(token);
    expect(result.transcript).not.toContain("BEGIN PRIVATE KEY");
  });

  it("posts the proven Oracle oral-temperature body", async () => {
    const { privateKey } = await generateKeyPair("RS384", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const token = "oracle-access-token-do-not-print";
    let posted = "";
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/token")) {
        return new Response(
          JSON.stringify({ access_token: token, expires_in: 300, scope: "system/Observation.write" }),
          { status: 200 },
        );
      }
      if (init?.method === "POST") {
        posted = String(init.body ?? "");
        return new Response(null, {
          status: 201,
          headers: { location: "https://fhir.example.test/r4/Observation/VS-209196396" },
        });
      }
      return new Response(posted, { status: 200 });
    };
    const result = await runSandboxProof(
      {
        LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
        LASTEHR_BACKEND: "oracle",
        LASTEHR_MCP_WRITES: "proposal",
        LASTEHR_CLIENT_ID: "client",
        LASTEHR_PRIVATE_KEY: pem,
        LASTEHR_KEY_ID: "lastehr-oracle-1",
        LASTEHR_SCOPES: "system/Observation.write",
        LASTEHR_ENCOUNTER: "Encounter/97954294",
        LASTEHR_PERFORMER: "Practitioner/12724064",
        LASTEHR_PATIENT_ID: "12724066",
        LASTEHR_FHIR_BASE_URL: "https://fhir.example.test/r4",
        LASTEHR_TOKEN_URL: "https://auth.example.test/token",
      } as unknown as NodeJS.ProcessEnv,
      fetchFn as typeof globalThis.fetch,
    );
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(posted) as {
      valueQuantity?: { unit?: string; code?: string };
      encounter?: { reference?: string };
      performer?: Array<{
        reference?: string;
        extension?: Array<{
          url?: string;
          valueCodeableConcept?: { coding?: Array<{ code?: string }> };
        }>;
      }>;
      meta?: { tag?: unknown };
    };
    expect(body.valueQuantity).toMatchObject({
      value: 37,
      unit: "degC",
      system: "http://unitsofmeasure.org",
      code: "Cel",
    });
    expect(body.encounter?.reference).toBe("Encounter/97954294");
    expect(body.performer?.[0]?.reference).toBe("Practitioner/12724064");
    expect(body.performer?.[0]?.extension?.[0]?.url).toBe(
      "http://hl7.org/fhir/StructureDefinition/event-performerFunction",
    );
    expect(body.performer?.[0]?.extension?.[0]?.valueCodeableConcept?.coding?.[0]?.code).toBe("LA");
    expect(body.meta?.tag).toBeUndefined();
    expect(posted).not.toContain('"unit":"Cel"');
    expect(result.transcript).not.toContain(token);
    expect(result.transcript).not.toContain("BEGIN PRIVATE KEY");
  });

  it("prints OperationOutcome diagnostics when the FHIR create returns 400", async () => {
    const { privateKey } = await generateKeyPair("RS384", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const token = "epic-access-token-do-not-print";
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/token")) {
        return new Response(
          JSON.stringify({ access_token: token, expires_in: 300 }),
          { status: 200 },
        );
      }
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({
            resourceType: "OperationOutcome",
            issue: [
              {
                severity: "fatal",
                diagnostics: "Invalid unit given: bpm. Unit expected: /min",
                details: {
                  text: "Invalid unit given: bpm. Unit expected: /min",
                  coding: [{ code: "59102" }],
                },
              },
            ],
            echo: token,
          }),
          { status: 400, headers: { "content-type": "application/fhir+json" } },
        );
      }
      return new Response("not called", { status: 500 });
    };
    const result = await runSandboxProof(
      {
        LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
        LASTEHR_BACKEND: "epic",
        LASTEHR_MCP_WRITES: "proposal",
        LASTEHR_CLIENT_ID: "client",
        LASTEHR_PRIVATE_KEY: pem,
        LASTEHR_ENCOUNTER: "Encounter/eMT95RPaM-HxLc3NeIA5qlQ3",
        LASTEHR_PATIENT_ID: "erXuFYUfucBZaryVksYEcMg3",
        LASTEHR_FHIR_BASE_URL: "https://fhir.example.test/R4",
        LASTEHR_TOKEN_URL: "https://auth.example.test/token",
      } as unknown as NodeJS.ProcessEnv,
      fetchFn as typeof globalThis.fetch,
    );
    expect(result.exitCode).toBe(1);
    expect(result.transcript).toContain("HTTP 400");
    expect(result.transcript).toContain("59102");
    expect(result.transcript).toContain("Invalid unit given: bpm. Unit expected: /min");
    expect(result.transcript).not.toContain(token);
    expect(result.transcript).not.toContain("BEGIN PRIVATE KEY");
  });

  it("does not print a non-OperationOutcome 400 body", async () => {
    const { privateKey } = await generateKeyPair("RS384", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/token")) {
        return new Response(JSON.stringify({ access_token: "token", expires_in: 300 }), { status: 200 });
      }
      if (init?.method === "POST") {
        return new Response("SECRET_BODY_TOKEN", { status: 400 });
      }
      return new Response("not called", { status: 500 });
    };
    const result = await runSandboxProof(
      {
        LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
        LASTEHR_BACKEND: "epic",
        LASTEHR_MCP_WRITES: "proposal",
        LASTEHR_CLIENT_ID: "client",
        LASTEHR_PRIVATE_KEY: pem,
        LASTEHR_ENCOUNTER: "Encounter/enc-1",
        LASTEHR_PATIENT_ID: "patient-1",
        LASTEHR_FHIR_BASE_URL: "https://fhir.example.test/R4",
        LASTEHR_TOKEN_URL: "https://auth.example.test/token",
      } as unknown as NodeJS.ProcessEnv,
      fetchFn as typeof globalThis.fetch,
    );
    expect(result.exitCode).toBe(1);
    expect(result.transcript).toContain("FHIR request failed: HTTP 400");
    expect(result.transcript).not.toContain("SECRET_BODY_TOKEN");
  });
});
