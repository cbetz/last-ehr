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
    expect(result.transcript).not.toContain(token);
    expect(result.transcript).not.toContain("BEGIN PRIVATE KEY");
  });
});
